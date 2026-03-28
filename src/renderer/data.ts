import { createInitialAgentRecords } from '@shared/agents'
import type { AppSeed, TabDefinition } from './types'

export const tabs: TabDefinition[] = [
  { id: 'onboarding', label: 'Onboarding', hint: 'Preflight' },
  { id: 'project', label: 'Project Setup', hint: 'Workspace' },
  { id: 'dashboard', label: 'Dashboard', hint: 'Control' },
  { id: 'agents', label: 'Agents', hint: 'Coordination' },
  { id: 'bugs', label: 'Bugs', hint: 'Triage' },
  { id: 'research', label: 'Research', hint: 'Evidence' },
  { id: 'runs', label: 'Runs', hint: 'History' },
  { id: 'settings', label: 'Settings', hint: 'Policy' },
]

export function createFallbackSeed(): AppSeed {
  const timestamp = new Date().toISOString()

  return {
    status: {
      codexPath: '/Users/example/.npm-global/bin/codex',
      codexPathSource: 'common-path',
      loginStatusOutput: 'Logged in using ChatGPT',
      versionOutput: 'codex-cli 0.117.0',
      shellPath: '/bin/zsh',
      browserReady: true,
      platform: 'darwin',
      preflight: {
        ok: true,
        detectedVersion: '0.117.0',
        loginState: 'logged-in',
        issues: [],
        guidance: [],
      },
    },
    snapshot: {
      project: {
        name: 'Sample client migration',
        rootPath: '/Users/example/clients/sample-client',
        workspacePath: '/Users/example/clients/sample-client/vibeplanner',
        repoMode: 'existing',
        briefPath: '/Users/example/briefs/sample-client.md',
        copiedBriefPath: '/Users/example/clients/sample-client/vibeplanner/artifacts/input-brief.md',
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
      },
      preflight: {
        ok: true,
        detectedVersion: '0.117.0',
        loginState: 'logged-in',
        issues: [],
        guidance: [],
      },
      agents: createInitialAgentRecords().map((agent, index) => ({
        ...agent,
        status: agent.id === 'strategy' ? 'planning' : index > 3 ? 'reviewing' : 'working',
        progress: 35 + index * 8,
        queue: Math.max(0, 4 - index),
        focus: agent.mission,
        lastUpdate: 'Renderer fallback seed loaded.',
        tempAgents: agent.id === 'strategy' ? ['browser-scout', 'release-auditor'] : [],
      })),
      bugs: [
        {
          id: 'bug-sample-1',
          title: 'Brief path does not persist after reload',
          severity: 'high',
          status: 'open',
          discoveredBy: 'testing-1',
          triagedBy: 'strategy',
          assignedTo: 'development-1',
          reproduction: 'Select a brief, refresh the app shell, and inspect Project Setup.',
          evidencePaths: ['vibeplanner/testing-agent-1/brief-persistence.png'],
          linkedRunId: 'run-sample-1',
          linkedTask: 'Restore persisted brief path',
          details: 'The manager wants this fixed before the next release candidate.',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      research: [
        {
          id: 'research-sample-1',
          title: 'Codex-style split pane interface',
          kind: 'product',
          url: 'https://developers.openai.com/codex/',
          notes: 'Dense sidebars and strong status surfaces improve scanability for agent-heavy tools.',
          takeaways: ['Keep the main shell compact', 'Use inspector detail panels for context'],
          evidencePaths: ['vibeplanner/research-agent/ui-notes.md'],
          createdAt: timestamp,
        },
      ],
      runs: [
        {
          id: 'run-sample-1',
          title: 'Initial client brief execution',
          phase: 'Execution',
          status: 'running',
          startedAt: timestamp,
          updatedAt: timestamp,
          agentIds: ['strategy', 'research', 'development-1', 'development-2', 'testing-1', 'testing-2', 'production'],
          summary: 'Strategy routed the work and the active agents are executing their first tasks.',
          blockers: ['Need real project attachment before live Codex execution.'],
        },
      ],
      messages: [
        {
          id: 'message-sample-1',
          from: 'strategy',
          to: 'development-1',
          type: 'decision',
          linkedRunId: 'run-sample-1',
          linkedBugId: null,
          linkedTask: 'Bootstrap app shell',
          body: 'Own the desktop shell and IPC contract. Coordinate persistence details with Development Agent 2.',
          createdAt: timestamp,
        },
      ],
      artifacts: [
        {
          id: 'artifact-sample-1',
          label: 'Sample brief copy',
          kind: 'brief',
          path: '/Users/example/clients/sample-client/vibeplanner/artifacts/input-brief.md',
          agentId: 'system',
          createdAt: timestamp,
        },
      ],
    },
  }
}
