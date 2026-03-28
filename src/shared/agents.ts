import type { AgentProfile, AgentRecord, AgentRole, ProjectConfig } from './types'

export const CORE_AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'operator',
    name: 'Operator Agent',
    roleLabel: 'Human Guide',
    folderName: 'operator-agent',
    mission: 'Translate team activity into plain English, keep the user informed, and explain what happens next.',
    permissions: ['read project files', 'read workspace outputs', 'write user-facing summaries', 'request only essential human input'],
    expectedArtifacts: ['operator-summary.md', 'phase-updates.md', 'handoff notes'],
    escalationPolicy: 'Ask the user only when there is a concrete missing decision, credential, or approval.',
    completionCriteria: ['The current phase is understandable', 'the next step is explicit', 'blockers are explained in plain English'],
    canSpawnTemporaryAgents: false,
  },
  {
    id: 'research',
    name: 'Research Agent',
    roleLabel: 'Discovery',
    folderName: 'research-agent',
    mission: 'Research competing products, patterns, and relevant references without copying third-party code.',
    permissions: ['read project files', 'use Codex web search', 'request browser captures', 'write notes and summaries'],
    expectedArtifacts: ['source-notes.md', 'evidence captures', 'reference summaries'],
    escalationPolicy: 'Escalate framework or scope decisions to the Strategy Agent.',
    completionCriteria: ['Sources are cited', 'takeaways are actionable', 'copied code is avoided'],
    canSpawnTemporaryAgents: false,
  },
  {
    id: 'strategy',
    name: 'Strategy Agent',
    roleLabel: 'Manager',
    folderName: 'strategy-agent',
    mission: 'Own planning, decomposition, bug triage, dependency routing, and temporary subagent creation.',
    permissions: ['read project files', 'write plans', 'route work', 'spawn temporary agents'],
    expectedArtifacts: ['plan.md', 'task-routing.md', 'bug-triage.md'],
    escalationPolicy: 'Resolve blockers for dev and test agents; ask the user only for truly missing external context.',
    completionCriteria: ['Tasks are routed', 'bugs are triaged', 'deliverables are tracked'],
    canSpawnTemporaryAgents: true,
  },
  {
    id: 'development-1',
    name: 'Development Agent 1',
    roleLabel: 'Implementation',
    folderName: 'development-agent-1',
    mission: 'Implement core features and collaborate with Development Agent 2 without overwriting each other.',
    permissions: ['read project files', 'write code in workspace', 'run focused validation'],
    expectedArtifacts: ['implementation notes', 'code changes', 'handoff messages'],
    escalationPolicy: 'Raise blockers to the Strategy Agent after first attempting a concrete resolution path.',
    completionCriteria: ['Code is clean', 'artifacts are logged', 'validation is recorded'],
    canSpawnTemporaryAgents: false,
  },
  {
    id: 'development-2',
    name: 'Development Agent 2',
    roleLabel: 'Implementation',
    folderName: 'development-agent-2',
    mission: 'Implement complementary features, hardening, and bug fixes alongside Development Agent 1.',
    permissions: ['read project files', 'write code in workspace', 'run focused validation'],
    expectedArtifacts: ['implementation notes', 'bug-fix notes', 'handoff messages'],
    escalationPolicy: 'Raise blockers to the Strategy Agent after coordinating with the dev pair.',
    completionCriteria: ['Code is clean', 'handoffs are explicit', 'bugs are closed with evidence'],
    canSpawnTemporaryAgents: false,
  },
  {
    id: 'testing-1',
    name: 'Testing Agent 1',
    roleLabel: 'Quality',
    folderName: 'testing-agent-1',
    mission: 'Exercise the software like a real user and file structured bugs with evidence.',
    permissions: ['read project files', 'run browser checks', 'write bug reports', 'store traces and screenshots'],
    expectedArtifacts: ['bug drafts', 'screenshots', 'trace summaries'],
    escalationPolicy: 'Send all bugs to the Strategy Agent first for triage and rewriting.',
    completionCriteria: ['Bugs include reproduction steps', 'evidence is attached', 'no direct dev assignment'],
    canSpawnTemporaryAgents: false,
  },
  {
    id: 'testing-2',
    name: 'Testing Agent 2',
    roleLabel: 'Quality',
    folderName: 'testing-agent-2',
    mission: 'Cross-check fixes, validate regressions, and confirm release readiness.',
    permissions: ['read project files', 'run browser checks', 'write bug reports', 'store traces and screenshots'],
    expectedArtifacts: ['regression notes', 'screenshots', 'release validation notes'],
    escalationPolicy: 'Send all bugs to the Strategy Agent first for triage and rewriting.',
    completionCriteria: ['Fixes are re-tested', 'release risks are explicit', 'evidence is attached'],
    canSpawnTemporaryAgents: false,
  },
  {
    id: 'production',
    name: 'Production Agent',
    roleLabel: 'Release',
    folderName: 'production-agent',
    mission: 'Prepare packaging, smoke validation, and final delivery notes.',
    permissions: ['read project files', 'run packaging checks', 'write release notes'],
    expectedArtifacts: ['release checklist', 'packaging notes', 'handoff summary'],
    escalationPolicy: 'Coordinate only with the Strategy Agent for release gating.',
    completionCriteria: ['Build readiness is explicit', 'release notes are written', 'handoff is complete'],
    canSpawnTemporaryAgents: false,
  },
]

export function createInitialAgentRecords(): AgentRecord[] {
  return CORE_AGENT_PROFILES.map((profile, index) => ({
    ...profile,
    status: profile.id === 'strategy' ? 'planning' : 'idle',
    progress: index === 1 ? 10 : 0,
    queue: 0,
    focus: profile.mission,
    lastUpdate: 'Awaiting assignment.',
    activitySummary: 'No live activity yet.',
    lastActivityAt: null,
    resumeCount: 0,
    tempAgents: [],
    pid: null,
    sessionId: null,
  }))
}

export function getAgentProfile(agentId: AgentRole): AgentProfile {
  const profile = CORE_AGENT_PROFILES.find((entry) => entry.id === agentId)
  if (!profile) {
    throw new Error(`Unknown agent profile: ${agentId}`)
  }

  return profile
}

export function buildAgentPrompt(
  project: ProjectConfig,
  agent: AgentRecord,
  inbox: string,
  objectiveOverride?: string,
  runId?: string | null,
  resumeContext?: string,
): string {
  const objective = objectiveOverride ?? agent.mission
  const operatorAppendix = agent.id === 'operator'
    ? `
Special focus for the Operator Agent:
- Write for a human, not for another agent.
- Keep explanations concise, plain, and action-oriented.
- Maintain a running explanation of what the team is doing now, what is blocked, and what the human should expect next.
- If you need user input, ask exactly one concrete question and explain why it matters.
`.trim()
    : ''

  return `
You are ${agent.name}, one of the core VibePlanner agents.

Mission:
${objective}

Project:
- Name: ${project.name}
- Root: ${project.rootPath}
- Workspace: ${project.workspacePath}
- Brief copy: ${project.copiedBriefPath ?? 'No brief attached'}
- Run ID: ${runId ?? 'No active run'}
- Browser mode: ${project.browserMode}
- Runtime model: ${project.codexRuntime.model}
- Reasoning effort: ${project.codexRuntime.reasoningEffort}
- Agent workspace: ${project.workspacePath}/${agent.folderName}
- Shared messages: ${project.workspacePath}/messages/index.json
- Checkpoint file: ${project.workspacePath}/${agent.folderName}/status.md

Role contract:
- Allowed actions: ${agent.permissions.join('; ')}
- Required artifacts: ${agent.expectedArtifacts.join('; ')}
- Escalation policy: ${agent.escalationPolicy}
- Completion criteria: ${agent.completionCriteria.join('; ')}

Operating rules:
- Work autonomously and continue proactively until your completion criteria are satisfied.
- Stay strictly inside the approved project root and the vibeplanner workspace.
- Read the project brief and current workspace files before making decisions.
- Resume unfinished work instead of restarting from scratch whenever prior notes, decisions, or checkpoints exist.
- Keep ${project.workspacePath}/${agent.folderName}/status.md current with your latest plan, progress, and next actions.
- Log decisions, outputs, and blockers into your own agent folder.
- Use the shared messages folder for handoffs and questions.
- Do not copy external third-party code into the project. External references are patterns only.
- Prefer action, verification, and persisted evidence over commentary.
${operatorAppendix ? `- ${operatorAppendix.split('\n').join('\n- ')}` : ''}

Resume context:
${resumeContext || 'No previous checkpoint context was found. Create one as you work.'}

Current inbox:
${inbox || 'No pending messages.'}
`.trim()
}
