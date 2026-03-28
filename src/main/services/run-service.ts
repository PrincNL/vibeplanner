import path from 'node:path'
import { createInitialAgentRecords } from '@shared/agents'
import { transitionBugStatus, transitionRunStatus } from '@shared/state'
import type {
  AgentRecord,
  ArtifactRecord,
  BugCreateInput,
  BugRecord,
  BugUpdateInput,
  ProjectSnapshot,
  RunMutationInput,
  RunSession,
  RunStartInput,
  TestingRunInput,
  TestingRunResult,
} from '@shared/types'
import { ProjectService } from './project-service'
import { CodexService } from './codex-service'
import { AgentOrchestrator } from './agent-orchestrator'

export class RunService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly codexService: CodexService,
    private readonly orchestrator: AgentOrchestrator,
  ) {}

  async startRun(input: RunStartInput): Promise<RunSession> {
    const snapshot = await this.requireSnapshot(input.projectRoot)
    if (!snapshot.preflight.ok) {
      throw new Error(snapshot.preflight.guidance[0] ?? 'Codex preflight failed.')
    }

    const startedAt = new Date().toISOString()
    const run: RunSession = {
      id: crypto.randomUUID(),
      title: input.title?.trim() || 'Primary execution run',
      phase: 'Execution',
      status: 'running',
      startedAt,
      updatedAt: startedAt,
      agentIds: snapshot.agents.map((agent) => agent.id),
      summary: 'Codex agents launched from VibePlanner.',
      blockers: [],
    }

    await this.projectService.saveRuns(input.projectRoot, [run, ...snapshot.runs])
    await this.projectService.saveAgents(
      input.projectRoot,
      createInitialAgentRecords().map((agent): AgentRecord => ({
        ...agent,
        status: agent.id === 'strategy' ? 'planning' : 'working',
        queue: 1,
        progress: agent.id === 'strategy' ? 15 : 5,
        focus: 'Executing initial assignment from project brief.',
        lastUpdate: `Queued for run ${run.id}.`,
      })),
    )

    await Promise.allSettled(
      snapshot.agents.map((agent) =>
        this.orchestrator.startAgent({
          projectRoot: input.projectRoot,
          agentId: agent.id,
          runId: run.id,
        }),
      ),
    )

    return run
  }

  async pauseRun(input: RunMutationInput): Promise<RunSession> {
    return this.updateRun(input, 'paused')
  }

  async resumeRun(input: RunMutationInput): Promise<RunSession> {
    const run = await this.updateRun(input, 'running')
    const snapshot = await this.requireSnapshot(input.projectRoot)
    await Promise.allSettled(
      snapshot.agents.map((agent) =>
        this.orchestrator.startAgent({
          projectRoot: input.projectRoot,
          agentId: agent.id,
          runId: input.runId,
        }),
      ),
    )

    return run
  }

  async listRuns(projectRoot: string): Promise<RunSession[]> {
    const snapshot = await this.requireSnapshot(projectRoot)
    return snapshot.runs
  }

  async createBug(input: BugCreateInput): Promise<BugRecord> {
    const snapshot = await this.requireSnapshot(input.projectRoot)
    const timestamp = new Date().toISOString()
    const bug: BugRecord = {
      ...input.bug,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.projectService.saveBugs(input.projectRoot, [bug, ...snapshot.bugs])
    return bug
  }

  async updateBug(input: BugUpdateInput): Promise<BugRecord> {
    const snapshot = await this.requireSnapshot(input.projectRoot)
    const bug = snapshot.bugs.find((entry) => entry.id === input.bugId)
    if (!bug) {
      throw new Error(`Bug not found: ${input.bugId}`)
    }

    const nextBug: BugRecord = {
      ...bug,
      status: input.status ? transitionBugStatus(bug.status, input.status) : bug.status,
      severity: input.severity ?? bug.severity,
      assignedTo: input.assignedTo === undefined ? bug.assignedTo : input.assignedTo,
      triagedBy: input.triagedBy === undefined ? bug.triagedBy : input.triagedBy,
      details: input.details ?? bug.details,
      updatedAt: new Date().toISOString(),
    }
    const nextBugs = snapshot.bugs.map((entry) => (entry.id === input.bugId ? nextBug : entry))
    await this.projectService.saveBugs(input.projectRoot, nextBugs)
    return nextBug
  }

  async listBugs(projectRoot: string): Promise<BugRecord[]> {
    const snapshot = await this.requireSnapshot(projectRoot)
    return snapshot.bugs
  }

  async runTesting(input: TestingRunInput): Promise<TestingRunResult> {
    const snapshot = await this.requireSnapshot(input.projectRoot)
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({ headless: input.headless ?? true })
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(input.targetUrl, { waitUntil: 'domcontentloaded' })
    const title = await page.title()
    const safeLabel = (input.label?.trim() || 'browser-check').replaceAll(/\s+/g, '-').toLowerCase()
    const screenshotPath = path.join(
      snapshot.project.workspacePath,
      'testing-agent-1',
      `${safeLabel}-${Date.now()}.png`,
    )
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await context.close()
    await browser.close()

    const artifact: ArtifactRecord = {
      id: crypto.randomUUID(),
      label: input.label?.trim() || 'Playwright browser check',
      kind: 'screenshot',
      path: screenshotPath,
      agentId: 'testing-1',
      createdAt: new Date().toISOString(),
    }
    await this.projectService.saveArtifacts(input.projectRoot, [artifact, ...snapshot.artifacts])

    return {
      screenshotPath,
      title,
    }
  }

  private async updateRun(input: RunMutationInput, nextStatus: 'running' | 'paused'): Promise<RunSession> {
    const snapshot = await this.requireSnapshot(input.projectRoot)
    const run = snapshot.runs.find((entry) => entry.id === input.runId)
    if (!run) {
      throw new Error(`Run not found: ${input.runId}`)
    }

    if (nextStatus === 'paused') {
      this.orchestrator.stopRunAgents(input.projectRoot, run.agentIds)
    }

    const nextRun: RunSession = {
      ...run,
      status: transitionRunStatus(run.status, nextStatus),
      updatedAt: new Date().toISOString(),
    }
    const nextRuns = snapshot.runs.map((entry) => (entry.id === input.runId ? nextRun : entry))
    await this.projectService.saveRuns(input.projectRoot, nextRuns)
    return nextRun
  }

  private async requireSnapshot(projectRoot: string): Promise<ProjectSnapshot> {
    const preflight = await this.codexService.runPreflight('0.117.0')
    return this.projectService.loadSnapshot(projectRoot, preflight)
  }
}
