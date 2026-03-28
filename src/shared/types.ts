import type { CodexPreflightResult } from './codex'
import type { BugStatus, RunStatus } from './state'
import type { RepoMode } from './workspace'

export type BrowserMode = 'hybrid'
export type AgentRole =
  | 'research'
  | 'strategy'
  | 'development-1'
  | 'development-2'
  | 'testing-1'
  | 'testing-2'
  | 'production'
export type AgentStatus = 'idle' | 'planning' | 'working' | 'blocked' | 'reviewing'
export type BugSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface CodexRuntimeProfile {
  model: string
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh'
  minimumVersion: string
  approvalPolicy: 'never'
  sandboxMode: 'workspace-write'
  enableSearch: boolean
}

export interface ProjectConfig {
  name: string
  rootPath: string
  workspacePath: string
  repoMode: RepoMode
  briefPath: string | null
  copiedBriefPath: string | null
  browserMode: BrowserMode
  codexRuntime: CodexRuntimeProfile
  createdAt: string
  updatedAt: string
}

export interface AgentProfile {
  id: AgentRole
  name: string
  roleLabel: string
  folderName: string
  mission: string
  permissions: string[]
  expectedArtifacts: string[]
  escalationPolicy: string
  completionCriteria: string[]
  canSpawnTemporaryAgents: boolean
}

export interface AgentRecord extends AgentProfile {
  status: AgentStatus
  progress: number
  queue: number
  focus: string
  lastUpdate: string
  activitySummary: string
  lastActivityAt: string | null
  resumeCount: number
  tempAgents: string[]
  pid: number | null
  sessionId: string | null
}

export interface AgentMessage {
  id: string
  from: AgentRole
  to: AgentRole
  type: 'handoff' | 'question' | 'decision' | 'bug'
  linkedRunId: string | null
  linkedBugId: string | null
  linkedTask: string | null
  body: string
  createdAt: string
}

export interface ArtifactRecord {
  id: string
  label: string
  kind: 'log' | 'screenshot' | 'trace' | 'brief' | 'note'
  path: string
  agentId: AgentRole | 'system'
  createdAt: string
}

export interface BugRecord {
  id: string
  title: string
  severity: BugSeverity
  status: BugStatus
  discoveredBy: AgentRole
  triagedBy: AgentRole | null
  assignedTo: AgentRole | null
  reproduction: string
  evidencePaths: string[]
  linkedRunId: string | null
  linkedTask: string | null
  details: string
  createdAt: string
  updatedAt: string
}

export interface ResearchSource {
  id: string
  title: string
  kind: 'repository' | 'article' | 'product' | 'capture'
  url: string
  notes: string
  takeaways: string[]
  evidencePaths: string[]
  createdAt: string
}

export interface RunSession {
  id: string
  title: string
  phase: string
  status: RunStatus
  startedAt: string
  updatedAt: string
  lastAgentActivityAt: string | null
  resumeCount: number
  agentIds: AgentRole[]
  summary: string
  blockers: string[]
}

export interface ProjectSnapshot {
  project: ProjectConfig
  preflight: CodexPreflightResult
  agents: AgentRecord[]
  bugs: BugRecord[]
  research: ResearchSource[]
  runs: RunSession[]
  messages: AgentMessage[]
  artifacts: ArtifactRecord[]
}

export interface CreateProjectInput {
  rootPath: string
  name: string
  repoMode: RepoMode
  briefPath: string | null
}

export interface AgentStartInput {
  projectRoot: string
  agentId: AgentRole
  objectiveOverride?: string
  runId?: string | null
}

export interface AgentLogsInput {
  projectRoot: string
  agentId: AgentRole
}

export interface AgentStopInput {
  projectRoot: string
  agentId: AgentRole
}

export interface AgentMessageInput {
  projectRoot: string
  message: Omit<AgentMessage, 'id' | 'createdAt'>
}

export interface RunStartInput {
  projectRoot: string
  title?: string
}

export interface RunMutationInput {
  projectRoot: string
  runId: string
}

export interface BugCreateInput {
  projectRoot: string
  bug: Omit<BugRecord, 'id' | 'createdAt' | 'updatedAt'>
}

export interface BugUpdateInput {
  projectRoot: string
  bugId: string
  status?: BugStatus
  severity?: BugSeverity
  assignedTo?: AgentRole | null
  triagedBy?: AgentRole | null
  details?: string
}

export interface TestingRunInput {
  projectRoot: string
  targetUrl: string
  label?: string
  headless?: boolean
}

export interface TestingRunResult {
  screenshotPath: string
  title: string
}

export interface SystemStatus {
  preflight: CodexPreflightResult
  codexPath: string | null
  codexPathSource: 'process-env' | 'common-path' | 'login-shell' | 'missing'
  loginStatusOutput: string
  versionOutput: string
  shellPath: string
  browserReady: boolean
  platform: NodeJS.Platform
}

export interface VibePlannerApi {
  system: {
    preflight: () => Promise<SystemStatus>
  }
  project: {
    create: (input: CreateProjectInput) => Promise<ProjectSnapshot>
    attach: (input: CreateProjectInput) => Promise<ProjectSnapshot>
    load: (projectRoot: string) => Promise<ProjectSnapshot>
    pickDirectory: () => Promise<string | null>
    pickBrief: () => Promise<string | null>
  }
  agent: {
    start: (input: AgentStartInput) => Promise<AgentRecord>
    stop: (input: AgentStopInput) => Promise<void>
    sendMessage: (input: AgentMessageInput) => Promise<AgentMessage>
    getLogs: (input: AgentLogsInput) => Promise<string>
  }
  run: {
    start: (input: RunStartInput) => Promise<RunSession>
    pause: (input: RunMutationInput) => Promise<RunSession>
    resume: (input: RunMutationInput) => Promise<RunSession>
    recover: (projectRoot: string) => Promise<RunSession | null>
    list: (projectRoot: string) => Promise<RunSession[]>
  }
  bug: {
    create: (input: BugCreateInput) => Promise<BugRecord>
    update: (input: BugUpdateInput) => Promise<BugRecord>
    list: (projectRoot: string) => Promise<BugRecord[]>
  }
  artifact: {
    open: (absolutePath: string) => Promise<void>
  }
  browser: {
    openExternal: (target: string) => Promise<void>
  }
  testing: {
    run: (input: TestingRunInput) => Promise<TestingRunResult>
  }
}
