import path from 'node:path'

export type RepoMode = 'new' | 'existing'

export const WORKSPACE_DIRECTORIES = [
  'operator-agent',
  'research-agent',
  'strategy-agent',
  'development-agent-1',
  'development-agent-2',
  'testing-agent-1',
  'testing-agent-2',
  'production-agent',
  'bugs',
  'runs',
  'messages',
  'artifacts',
] as const

export interface WorkspaceBootstrapPlan {
  projectRoot: string
  workspaceRoot: string
  gitRoot: string
  createdPaths: string[]
  initializeGit: boolean
}

export interface WorkspacePaths {
  projectRoot: string
  workspaceRoot: string
  projectConfigFile: string
  agentsFile: string
  bugsFile: string
  runsFile: string
  messagesFile: string
  researchFile: string
  artifactsFile: string
}

export function buildWorkspaceBootstrapPlan(
  projectRoot: string,
  repoMode: RepoMode,
): WorkspaceBootstrapPlan {
  const workspaceRoot = path.join(projectRoot, 'vibeplanner')
  const createdPaths = [
    workspaceRoot,
    ...WORKSPACE_DIRECTORIES.map((segment) => path.join(workspaceRoot, segment)),
  ]

  return {
    projectRoot,
    workspaceRoot,
    gitRoot: path.join(projectRoot, '.git'),
    createdPaths,
    initializeGit: repoMode === 'new',
  }
}

export function getWorkspacePaths(projectRoot: string): WorkspacePaths {
  const workspaceRoot = path.join(projectRoot, 'vibeplanner')

  return {
    projectRoot,
    workspaceRoot,
    projectConfigFile: path.join(workspaceRoot, 'project.json'),
    agentsFile: path.join(workspaceRoot, 'agents.json'),
    bugsFile: path.join(workspaceRoot, 'bugs', 'index.json'),
    runsFile: path.join(workspaceRoot, 'runs', 'index.json'),
    messagesFile: path.join(workspaceRoot, 'messages', 'index.json'),
    researchFile: path.join(workspaceRoot, 'research-agent', 'index.json'),
    artifactsFile: path.join(workspaceRoot, 'artifacts', 'manifest.json'),
  }
}
