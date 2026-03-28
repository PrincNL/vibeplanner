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
    const [agents, bugs, research, runs, messages, artifacts] = await Promise.all([
      readJsonFile<AgentRecord[]>(paths.agentsFile, createInitialAgentRecords()),
      readJsonFile<BugRecord[]>(paths.bugsFile, []),
      readJsonFile<ResearchSource[]>(paths.researchFile, []),
      readJsonFile<RunSession[]>(paths.runsFile, []),
      readJsonFile<AgentMessage[]>(paths.messagesFile, []),
      readJsonFile<ArtifactRecord[]>(paths.artifactsFile, []),
    ])

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
        ]
      }),
    )
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
