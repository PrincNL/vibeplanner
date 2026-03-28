import { execFile } from 'node:child_process'
import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { createInitialAgentRecords } from '@shared/agents'
import type {
  AgentMessage,
  AgentRecord,
  ArtifactRecord,
  BugRecord,
  CreateProjectInput,
  ProjectConfig,
  ProjectSnapshot,
  ResearchSource,
  RunSession,
} from '@shared/types'
import type { CodexPreflightResult } from '@shared/codex'
import { getWorkspacePaths, buildWorkspaceBootstrapPlan } from '@shared/workspace'
import { readJsonFile, writeJsonFile } from './json-store'

const execFileAsync = promisify(execFile)

const projectSchema = z.object({
  name: z.string(),
  rootPath: z.string(),
  workspacePath: z.string(),
  repoMode: z.enum(['new', 'existing']),
  briefPath: z.string().nullable(),
  copiedBriefPath: z.string().nullable(),
  browserMode: z.literal('hybrid'),
  codexRuntime: z.object({
    model: z.string(),
    reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh']),
    minimumVersion: z.string(),
    approvalPolicy: z.literal('never'),
    sandboxMode: z.literal('workspace-write'),
    enableSearch: z.boolean(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export class ProjectService {
  async createProject(input: CreateProjectInput): Promise<ProjectConfig> {
    return this.initializeProject({ ...input, repoMode: 'new' })
  }

  async attachProject(input: CreateProjectInput): Promise<ProjectConfig> {
    return this.initializeProject({ ...input, repoMode: 'existing' })
  }

  async loadSnapshot(projectRoot: string, preflight: CodexPreflightResult): Promise<ProjectSnapshot> {
    const paths = getWorkspacePaths(path.resolve(projectRoot))
    const project = projectSchema.parse(await readJsonFile(paths.projectConfigFile, null))
    const [storedAgents, storedBugs, research, storedRuns, messages, artifacts] = await Promise.all([
      readJsonFile<Partial<AgentRecord>[]>(paths.agentsFile, createInitialAgentRecords()),
      readJsonFile<Partial<BugRecord>[]>(paths.bugsFile, []),
      readJsonFile<ResearchSource[]>(paths.researchFile, []),
      readJsonFile<Partial<RunSession>[]>(paths.runsFile, []),
      readJsonFile<AgentMessage[]>(paths.messagesFile, []),
      readJsonFile<ArtifactRecord[]>(paths.artifactsFile, []),
    ])
    const agents = this.normalizeAgents(storedAgents)
    const bugs = this.normalizeBugs(storedBugs)
    const runs = this.normalizeRuns(storedRuns)

    return {
      project,
      preflight,
      agents,
      bugs,
      research,
      runs,
      messages,
      artifacts,
    }
  }

  async saveAgents(projectRoot: string, agents: AgentRecord[]) {
    const paths = getWorkspacePaths(path.resolve(projectRoot))
    await writeJsonFile(paths.agentsFile, agents)
  }

  async saveRuns(projectRoot: string, runs: RunSession[]) {
    const paths = getWorkspacePaths(path.resolve(projectRoot))
    await writeJsonFile(paths.runsFile, runs)
  }

  async saveBugs(projectRoot: string, bugs: BugRecord[]) {
    const paths = getWorkspacePaths(path.resolve(projectRoot))
    await writeJsonFile(paths.bugsFile, bugs)
  }

  async saveMessages(projectRoot: string, messages: AgentMessage[]) {
    const paths = getWorkspacePaths(path.resolve(projectRoot))
    await writeJsonFile(paths.messagesFile, messages)
  }

  async saveArtifacts(projectRoot: string, artifacts: ArtifactRecord[]) {
    const paths = getWorkspacePaths(path.resolve(projectRoot))
    await writeJsonFile(paths.artifactsFile, artifacts)
  }

  async saveResearch(projectRoot: string, research: ResearchSource[]) {
    const paths = getWorkspacePaths(path.resolve(projectRoot))
    await writeJsonFile(paths.researchFile, research)
  }

  private async initializeProject(input: CreateProjectInput): Promise<ProjectConfig> {
    const projectRoot = path.resolve(input.rootPath)
    const plan = buildWorkspaceBootstrapPlan(projectRoot, input.repoMode)
    const timestamp = new Date().toISOString()

    if (input.repoMode === 'new') {
      await mkdir(projectRoot, { recursive: true })
    } else {
      await access(projectRoot)
      await access(path.join(projectRoot, '.git'))
    }

    for (const entry of plan.createdPaths) {
      await mkdir(entry, { recursive: true })
    }

    if (plan.initializeGit) {
      try {
        await execFileAsync('git', ['init'], { cwd: projectRoot })
      } catch {
        await mkdir(plan.gitRoot, { recursive: true })
      }
    }

    const copiedBriefPath = await this.copyBriefIntoWorkspace(projectRoot, input.briefPath)
    const project: ProjectConfig = {
      name: input.name.trim() || path.basename(projectRoot),
      rootPath: projectRoot,
      workspacePath: path.join(projectRoot, 'vibeplanner'),
      repoMode: input.repoMode,
      briefPath: input.briefPath,
      copiedBriefPath,
      browserMode: 'hybrid',
      codexRuntime: {
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        minimumVersion: '0.117.0',
        approvalPolicy: 'never',
        sandboxMode: 'workspace-write',
        enableSearch: true,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const paths = getWorkspacePaths(projectRoot)
    const briefArtifacts: ArtifactRecord[] = copiedBriefPath
      ? [
          {
            id: crypto.randomUUID(),
            label: 'Attached brief copy',
            kind: 'brief',
            path: copiedBriefPath,
            agentId: 'system',
            createdAt: timestamp,
          },
        ]
      : []

    await Promise.all([
      writeJsonFile(paths.projectConfigFile, project),
      writeJsonFile(paths.agentsFile, createInitialAgentRecords()),
      writeJsonFile(paths.bugsFile, [] satisfies BugRecord[]),
      writeJsonFile(paths.runsFile, [] satisfies RunSession[]),
      writeJsonFile(paths.messagesFile, [] satisfies AgentMessage[]),
      writeJsonFile(paths.researchFile, [] satisfies ResearchSource[]),
      writeJsonFile(paths.artifactsFile, briefArtifacts),
    ])

    await this.seedWorkspaceNotes(projectRoot)
    return project
  }

  private async copyBriefIntoWorkspace(projectRoot: string, briefPath: string | null): Promise<string | null> {
    if (!briefPath) {
      return null
    }

    const source = path.resolve(briefPath)
    const destination = path.join(projectRoot, 'vibeplanner', 'artifacts', 'input-brief.md')
    await copyFile(source, destination)
    return destination
  }

  private async seedWorkspaceNotes(projectRoot: string) {
    const workspaceRoot = path.join(projectRoot, 'vibeplanner')
    const agentFolders = (await readdir(workspaceRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('-agent'))
      .map((entry) => entry.name)

    await Promise.all(
      agentFolders.flatMap((folder) => {
        const basePath = path.join(workspaceRoot, folder)
        return [
          this.ensureMarkdown(path.join(basePath, 'notes.md'), `# ${folder}\n\n`),
          this.ensureMarkdown(path.join(basePath, 'decisions.md'), `# ${folder} decisions\n\n`),
          this.ensureMarkdown(
            path.join(basePath, 'status.md'),
            `# ${folder} status\n\n## Current state\nAwaiting assignment.\n\n## Next actions\n- Read the brief.\n- Inspect current project state.\n- Persist decisions and evidence here.\n`,
          ),
        ]
      }),
    )
  }

  private normalizeAgents(storedAgents: Partial<AgentRecord>[]): AgentRecord[] {
    const defaults = createInitialAgentRecords()

    return defaults.map((baseline) => {
      const stored = storedAgents.find((entry) => entry.id === baseline.id)
      return {
        ...baseline,
        ...stored,
        activitySummary: stored?.activitySummary ?? baseline.activitySummary,
        lastActivityAt: stored?.lastActivityAt ?? baseline.lastActivityAt,
        resumeCount: stored?.resumeCount ?? baseline.resumeCount,
      }
    })
  }

  private normalizeRuns(storedRuns: Partial<RunSession>[]): RunSession[] {
    return storedRuns
      .filter((run): run is Partial<RunSession> & Pick<RunSession, 'id' | 'title' | 'phase' | 'status' | 'startedAt' | 'updatedAt' | 'agentIds' | 'summary' | 'blockers'> =>
        Boolean(run.id && run.title && run.phase && run.status && run.startedAt && run.updatedAt && run.agentIds && run.summary && run.blockers),
      )
      .map((run) => ({
        ...run,
        lastAgentActivityAt: run.lastAgentActivityAt ?? null,
        resumeCount: run.resumeCount ?? 0,
      }))
  }

  private normalizeBugs(storedBugs: Partial<BugRecord>[]): BugRecord[] {
    return storedBugs
      .filter((bug): bug is Partial<BugRecord> & Pick<BugRecord, 'id' | 'title' | 'severity' | 'status' | 'discoveredBy' | 'createdAt' | 'updatedAt'> =>
        Boolean(bug.id && bug.title && bug.severity && bug.status && bug.discoveredBy && bug.createdAt && bug.updatedAt),
      )
      .map((bug) => ({
        ...bug,
        triagedBy: bug.triagedBy ?? null,
        assignedTo: bug.assignedTo ?? null,
        reproduction: bug.reproduction ?? 'No reproduction steps recorded yet.',
        evidencePaths: Array.isArray(bug.evidencePaths) ? bug.evidencePaths : [],
        linkedRunId: bug.linkedRunId ?? null,
        linkedTask: bug.linkedTask ?? null,
        details: bug.details ?? 'No implementation details recorded yet.',
      }))
  }

  private async ensureMarkdown(filePath: string, contents: string) {
    try {
      await access(filePath)
      const current = await readFile(filePath, 'utf8')
      if (!current) {
        await writeFile(filePath, contents, 'utf8')
      }
    } catch {
      await writeFile(filePath, contents, 'utf8')
    }
  }
}
