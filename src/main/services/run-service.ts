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

const RECOVERABLE_RUN_STATUSES = new Set<RunSession['status']>(['queued', 'running', 'paused'])

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

    const recoverableRun = this.findRecoverableRun(snapshot.runs)
    if (recoverableRun) {
      return this.recoverPersistedRun(snapshot, recoverableRun, 'Continuing the latest incomplete run.')
    }

    const startedAt = new Date().toISOString()
    const run: RunSession = {
      id: crypto.randomUUID(),
      title: input.title?.trim() || 'Primary execution run',
      phase: 'Execution',
      status: 'running',
      startedAt,
      updatedAt: startedAt,
      lastAgentActivityAt: startedAt,
      resumeCount: 0,
      agentIds: snapshot.agents.map((agent) => agent.id),
      summary: 'Codex agents launched from VibePlanner.',
      blockers: [],
    }

    const seededAgents = createInitialAgentRecords().map((agent): AgentRecord => ({
      ...agent,
      status: agent.id === 'strategy' ? 'planning' : 'working',
      queue: 1,
      progress: agent.id === 'strategy' ? 15 : agent.id === 'operator' ? 12 : 5,
      focus: agent.id === 'operator'
        ? 'Translate the run into a plain-English progress narrative for the human.'
        : 'Executing initial assignment from project brief.',
      lastUpdate: `Queued for run ${run.id}.`,
      activitySummary: agent.id === 'operator'
        ? 'Preparing the first human-facing summary.'
        : 'Preparing initial workspace scan.',
      lastActivityAt: startedAt,
    }))

    await this.projectService.saveRuns(input.projectRoot, [run, ...snapshot.runs])
    await this.projectService.saveAgents(input.projectRoot, seededAgents)
    await this.launchAgentsForRun(input.projectRoot, run.id, seededAgents)
    return run
  }

  async pauseRun(input: RunMutationInput): Promise<RunSession> {
    return this.updateRun(input, 'paused')
  }

  async resumeRun(input: RunMutationInput): Promise<RunSession> {
    const snapshot = await this.requireSnapshot(input.projectRoot)
    const run = snapshot.runs.find((entry) => entry.id === input.runId)
    if (!run) {
      throw new Error(`Run not found: ${input.runId}`)
    }

    return this.recoverPersistedRun(snapshot, run, 'Resuming the selected run from saved checkpoints.')
  }

  async recoverRun(projectRoot: string): Promise<RunSession | null> {
    const snapshot = await this.requireSnapshot(projectRoot)
    const run = this.findRecoverableRun(snapshot.runs)
    if (!run) {
      return null
    }

    return this.recoverPersistedRun(snapshot, run, 'Recovered after reopening VibePlanner.')
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

  private async recoverPersistedRun(
    snapshot: ProjectSnapshot,
    run: RunSession,
    reason: string,
  ): Promise<RunSession> {
    const now = new Date().toISOString()
    const nextRun: RunSession = {
      ...run,
      status: 'running',
      updatedAt: now,
      lastAgentActivityAt: run.lastAgentActivityAt ?? now,
      resumeCount: run.resumeCount + 1,
      summary: reason,
    }

    const nextRuns = snapshot.runs.map((entry) => (entry.id === run.id ? nextRun : entry))
    const nextAgents: AgentRecord[] = snapshot.agents.map((agent): AgentRecord => {
      if (!this.shouldResumeAgent(agent)) {
        return agent
      }

      return {
        ...agent,
        status: (agent.id === 'strategy' ? 'planning' : 'working') satisfies AgentRecord['status'],
        queue: Math.max(agent.queue, 1),
        progress: Math.max(agent.progress, 15),
        lastUpdate: `Recovered for run ${run.id}.`,
        activitySummary: agent.id === 'operator'
          ? 'Reloading the latest checkpoint and rebuilding the human-facing summary.'
          : 'Reloading persisted checkpoint and continuing work.',
        lastActivityAt: now,
        pid: null,
        sessionId: null,
      }
    })

    await this.projectService.saveRuns(snapshot.project.rootPath, nextRuns)
    await this.projectService.saveAgents(snapshot.project.rootPath, nextAgents)
    await this.launchAgentsForRun(snapshot.project.rootPath, run.id, nextAgents)
    return nextRun
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

    const timestamp = new Date().toISOString()
    const nextRun: RunSession = {
      ...run,
      status: transitionRunStatus(run.status, nextStatus),
      updatedAt: timestamp,
      lastAgentActivityAt: nextStatus === 'paused' ? run.lastAgentActivityAt : timestamp,
    }
    const nextRuns = snapshot.runs.map((entry) => (entry.id === input.runId ? nextRun : entry))
    await this.projectService.saveRuns(input.projectRoot, nextRuns)

    if (nextStatus === 'paused') {
      const nextAgents: AgentRecord[] = snapshot.agents.map((agent): AgentRecord =>
        run.agentIds.includes(agent.id)
          ? {
              ...agent,
              status: (agent.status === 'reviewing' ? agent.status : 'idle') satisfies AgentRecord['status'],
              queue: 0,
              pid: null,
              sessionId: null,
              lastUpdate: 'Run paused. Saved checkpoint can be resumed later.',
              activitySummary: 'Paused with persisted checkpoint.',
              lastActivityAt: timestamp,
            }
          : agent,
      )
      await this.projectService.saveAgents(input.projectRoot, nextAgents)
    }

    return nextRun
  }

  private async launchAgentsForRun(projectRoot: string, runId: string, agents: AgentRecord[]) {
    await Promise.allSettled(
      agents
        .filter((agent) => this.shouldResumeAgent(agent))
        .filter((agent) => !this.orchestrator.hasActiveSession(projectRoot, agent.id))
        .map((agent) =>
          this.orchestrator.startAgent({
            projectRoot,
            agentId: agent.id,
            runId,
          }),
        ),
    )
  }

  private findRecoverableRun(runs: RunSession[]): RunSession | null {
    return runs.find((run) => RECOVERABLE_RUN_STATUSES.has(run.status)) ?? null
  }

  private shouldResumeAgent(agent: AgentRecord): boolean {
    return agent.status !== 'reviewing' || agent.progress < 100 || agent.queue > 0
  }

  private async requireSnapshot(projectRoot: string): Promise<ProjectSnapshot> {
    const preflight = await this.codexService.runPreflight('0.117.0')
    return this.projectService.loadSnapshot(projectRoot, preflight)
  }
}
