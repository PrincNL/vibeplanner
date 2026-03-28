import { startTransition, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type {
  AgentRecord,
  AgentRole,
  BugRecord,
  CreateProjectInput,
  ProjectSnapshot,
  RunSession,
  SystemStatus,
} from '@shared/types'
import { tabs, createFallbackSeed } from './data'
import type { TabId } from './types'

const fallback = createFallbackSeed()
type IconName =
  | 'spark'
  | 'compass'
  | 'folder'
  | 'grid'
  | 'agents'
  | 'bug'
  | 'flask'
  | 'play'
  | 'settings'
  | 'refresh'
  | 'search'
  | 'rocket'
  | 'run'
  | 'terminal'
  | 'shield'
  | 'brain'
  | 'code'
  | 'beaker'
  | 'package'
  | 'chat'
  | 'chevron'

function iconPath(name: IconName) {
  switch (name) {
    case 'spark':
      return 'M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3zm6.5 9l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3zM6 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z'
    case 'compass':
      return 'M12 3a9 9 0 100 18 9 9 0 000-18zm3.8 5.2l-2 5.6-5.6 2 2-5.6 5.6-2z'
    case 'folder':
      return 'M3.5 7.5A2.5 2.5 0 016 5h3l1.5 2H18A2.5 2.5 0 0120.5 9.5v7A2.5 2.5 0 0118 19H6a2.5 2.5 0 01-2.5-2.5v-9z'
    case 'grid':
      return 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z'
    case 'agents':
      return 'M9 11a3 3 0 100-6 3 3 0 000 6zm6 2a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM4 19a5 5 0 0110 0H4zm9.5 0a4 4 0 018 0h-8z'
    case 'bug':
      return 'M12 7a3 3 0 013 3v1.2a4.8 4.8 0 011.8 3.8V18a3 3 0 01-3 3h-1.6a3 3 0 01-3 0H7.6a3 3 0 01-3-3v-3a4.8 4.8 0 011.8-3.8V10a3 3 0 013-3h2zm-7.5 5H2m4 4H2m16-4h4m-4 4h4M8 5L6.5 3.5M16 5l1.5-1.5'
    case 'flask':
      return 'M10 3h4m-3 0v5.2L6 17a2.5 2.5 0 002.2 3.7h7.6A2.5 2.5 0 0018 17l-5-8.8V3m-3.5 8h5'
    case 'play':
      return 'M8 6.5v11l8.5-5.5L8 6.5z'
    case 'settings':
      return 'M12 8.5A3.5 3.5 0 1112 15.5 3.5 3.5 0 0112 8.5zm0-5l1.1 2.3 2.6.4-1.9 1.9.4 2.6-2.2-1.1-2.2 1.1.4-2.6-1.9-1.9 2.6-.4L12 3.5zm0 11l1.1 2.3 2.6.4-1.9 1.9.4 2.6-2.2-1.1-2.2 1.1.4-2.6-1.9-1.9 2.6-.4L12 14.5z'
    case 'refresh':
      return 'M20 6v5h-5M4 18v-5h5m10.2-2A7 7 0 007.6 6.6L5 9m14 6l-2.6 2.4A7 7 0 014.8 17.4'
    case 'search':
      return 'M10.5 4a6.5 6.5 0 014.9 10.8l4.4 4.4-1.4 1.4-4.4-4.4A6.5 6.5 0 1110.5 4z'
    case 'rocket':
      return 'M14 4c2.5.2 4.3 2 4.5 4.5L14 13l-3 1-1 3-4.5 4.5c-.2-2.5 0-5.8 2.6-8.4C10.7 4 13.9 3.8 14 4zm-6 8L4 13l1-4 3-1'
    case 'run':
      return 'M13 5a2 2 0 110 4 2 2 0 010-4zM9 20l1.5-5 2.5-2 2 1.5V20h-2v-3l-1.5-1-1 4H9zm1-9l2-2 2.5 1 .8 2.5-1.8.6-.5-1.4-1-.4-1.2 1.2L10 11z'
    case 'terminal':
      return 'M4 6l5 5-5 5m7 1h9'
    case 'shield':
      return 'M12 3l7 3v5c0 4.4-2.7 7.8-7 10-4.3-2.2-7-5.6-7-10V6l7-3z'
    case 'brain':
      return 'M9 4.5A3.5 3.5 0 0012 10V4a3.5 3.5 0 00-3 0zm3 5.5a3.5 3.5 0 003-5.5A3.5 3.5 0 0012 4v6zm-5 0a3 3 0 00-1 5.8V17a3 3 0 006 0v-1.2A3 3 0 0112 10H7zm10 0h-5a3 3 0 010 5.8V17a3 3 0 006 0v-1.2A3 3 0 0017 10z'
    case 'code':
      return 'M9 8l-4 4 4 4m6-8l4 4-4 4M13.5 5l-3 14'
    case 'beaker':
      return 'M9 3h6m-4 0v5l-5 8a3 3 0 002.6 4.5h7.8A3 3 0 0019 16l-5-8V3m-4 9h4'
    case 'package':
      return 'M12 3l7 4v10l-7 4-7-4V7l7-4zm0 0v8m7-4l-7 4-7-4'
    case 'chat':
      return 'M5 6.5A2.5 2.5 0 017.5 4h9A2.5 2.5 0 0119 6.5v6A2.5 2.5 0 0116.5 15H10l-4 4v-4H7.5A2.5 2.5 0 015 12.5v-6z'
    case 'chevron':
      return 'M9 6l6 6-6 6'
  }
}

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPath(name)} />
    </svg>
  )
}

function getTabIcon(tabId: TabId): IconName {
  switch (tabId) {
    case 'onboarding':
      return 'spark'
    case 'project':
      return 'folder'
    case 'dashboard':
      return 'grid'
    case 'agents':
      return 'agents'
    case 'bugs':
      return 'bug'
    case 'research':
      return 'search'
    case 'runs':
      return 'run'
    case 'settings':
      return 'settings'
  }
}

function getSectionIcon(tabId: TabId): IconName {
  switch (tabId) {
    case 'onboarding':
      return 'shield'
    case 'project':
      return 'folder'
    case 'dashboard':
      return 'spark'
    case 'agents':
      return 'brain'
    case 'bugs':
      return 'bug'
    case 'research':
      return 'compass'
    case 'runs':
      return 'rocket'
    case 'settings':
      return 'settings'
  }
}

function getAgentIcon(role: AgentRole): IconName {
  switch (role) {
    case 'operator':
      return 'chat'
    case 'strategy':
      return 'brain'
    case 'research':
      return 'compass'
    case 'development-1':
    case 'development-2':
      return 'code'
    case 'testing-1':
    case 'testing-2':
      return 'beaker'
    case 'production':
      return 'package'
  }
}

function getStatusTone(status: SystemStatus | null, busy: boolean) {
  if (busy) {
    return 'Running tasks'
  }
  if (status?.preflight.ok) {
    return 'Ready to guide the run'
  }
  return 'Needs setup'
}

function hasApi() {
  return typeof window !== 'undefined' && Boolean(window.vibeplanner)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return 'No heartbeat yet'
  }

  const delta = Date.now() - new Date(value).getTime()
  if (Number.isNaN(delta) || delta < 0) {
    return 'Just now'
  }

  const seconds = Math.floor(delta / 1000)
  if (seconds < 10) {
    return 'Just now'
  }
  if (seconds < 60) {
    return `${seconds}s ago`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function compactPath(value: string | null | undefined) {
  if (!value) {
    return 'Select a directory to begin.'
  }

  const withHomeAlias = value.replace(/^\/Users\/[^/]+/, '~')
  if (withHomeAlias.length <= 24) {
    return withHomeAlias
  }

  const segments = withHomeAlias.split('/').filter(Boolean)
  if (segments.length <= 2) {
    return withHomeAlias
  }

  if (segments.length === 3) {
    return `${segments[0] === '~' ? '~/' : '/'}.../${segments.slice(-1).join('/')}`
  }

  return `${segments[0] === '~' ? '~/' : '/'}.../${segments.slice(-2).join('/')}`
}

function pathTailLabel(value: string | null | undefined) {
  if (!value) {
    return 'No folder selected'
  }

  const segments = value.split('/').filter(Boolean)
  return segments.at(-1) ?? value
}

function isAgentLive(agent: AgentRecord) {
  return agent.status === 'working' || agent.status === 'planning' || Boolean(agent.pid)
}

function findRecoverableRun(snapshot: ProjectSnapshot | null) {
  return snapshot?.runs.find((run) => run.status === 'running' || run.status === 'queued' || run.status === 'paused') ?? null
}

function getTabTitle(tabId: TabId) {
  return tabs.find((tab) => tab.id === tabId)?.label ?? 'Workspace'
}

function getTabSummary(tabId: TabId) {
  switch (tabId) {
    case 'onboarding':
      return 'Check Codex, auth, and browser readiness before you start a client run.'
    case 'project':
      return 'Attach the real project folder and brief so the team knows where to work.'
    case 'dashboard':
      return 'See what the team is doing now, what comes next, and where human input is needed.'
    case 'agents':
      return 'Advanced view for raw agent state, control, and log inspection.'
    case 'bugs':
      return 'Review the triaged bug queue and move issues through the fix lifecycle.'
    case 'research':
      return 'Browse research findings, references, and reusable product patterns.'
    case 'runs':
      return 'Manage execution runs and inspect their latest status and blockers.'
    case 'settings':
      return 'Review runtime policy and trigger browser smoke checks.'
  }
}

type WorkflowStage = {
  id: string
  label: string
  state: 'todo' | 'active' | 'done'
}

function deriveWorkflowStages(snapshot: ProjectSnapshot | null, status: SystemStatus | null): WorkflowStage[] {
  const hasProject = Boolean(snapshot)
  const hasRun = Boolean(snapshot?.runs.length)
  const activeRun = findRecoverableRun(snapshot)
  const hasImplementation = Boolean(
    snapshot?.agents.some((agent) => (agent.id === 'development-1' || agent.id === 'development-2') && agent.progress > 0),
  )
  const hasTesting = Boolean(snapshot?.bugs.length || snapshot?.agents.some((agent) => agent.id.startsWith('testing') && agent.progress > 0))
  const hasRelease = Boolean(snapshot?.agents.find((agent) => agent.id === 'production' && agent.progress > 0))

  return [
    { id: 'preflight', label: 'Ready', state: status?.preflight.ok ? 'done' : 'active' },
    { id: 'attach', label: 'Attach project', state: hasProject ? 'done' : status?.preflight.ok ? 'active' : 'todo' },
    { id: 'brief', label: 'Understand brief', state: snapshot?.project.copiedBriefPath ? 'done' : hasProject ? 'active' : 'todo' },
    { id: 'plan', label: 'Plan work', state: hasRun ? (activeRun ? 'active' : 'done') : hasProject ? 'active' : 'todo' },
    { id: 'build', label: 'Build', state: hasImplementation ? (hasTesting || hasRelease ? 'done' : 'active') : hasRun ? 'active' : 'todo' },
    { id: 'test', label: 'Test', state: hasTesting ? (snapshot?.bugs.some((bug) => bug.status !== 'fixed') ? 'active' : 'done') : hasImplementation ? 'active' : 'todo' },
    { id: 'ship', label: 'Ship', state: hasRelease ? 'active' : hasTesting ? 'active' : 'todo' },
  ]
}

function getOperatorAgent(snapshot: ProjectSnapshot | null) {
  return snapshot?.agents.find((agent) => agent.id === 'operator') ?? null
}

function getLeadAgent(snapshot: ProjectSnapshot | null) {
  return snapshot?.agents
    .filter((agent) => agent.id !== 'operator')
    .sort((left, right) => {
      const leftLive = Number(isAgentLive(left))
      const rightLive = Number(isAgentLive(right))
      if (leftLive !== rightLive) {
        return rightLive - leftLive
      }
      return right.progress - left.progress
    })[0] ?? null
}

function getCurrentObjective(snapshot: ProjectSnapshot | null) {
  const leadAgent = getLeadAgent(snapshot)
  if (!snapshot) {
    return 'Attach a project to begin.'
  }
  if (!snapshot.runs.length) {
    return 'Review the brief and start the first guided run.'
  }
  if (leadAgent) {
    return leadAgent.focus
  }
  return snapshot.runs[0]?.summary ?? 'Waiting for the next run command.'
}

function getPrimaryBlocker(snapshot: ProjectSnapshot | null, status: SystemStatus | null) {
  if (!status?.preflight.ok) {
    return status?.preflight.guidance[0] ?? 'Codex preflight still has blockers.'
  }
  const blockedAgent = snapshot?.agents.find((agent) => agent.status === 'blocked')
  if (blockedAgent) {
    return `${blockedAgent.name}: ${blockedAgent.lastUpdate}`
  }
  const openBug = snapshot?.bugs.find((bug) => bug.status !== 'fixed')
  if (openBug) {
    return `${openBug.title} is still in ${openBug.status}.`
  }
  return 'No immediate blocker is recorded.'
}

function getNextExpectedOutcome(snapshot: ProjectSnapshot | null) {
  if (!snapshot) {
    return 'A workspace snapshot after you attach a project.'
  }
  if (!snapshot.runs.length) {
    return 'A scoped execution plan from the strategy and operator agents.'
  }
  if (snapshot.bugs.some((bug) => bug.status !== 'fixed')) {
    return 'A clearer fix handoff and updated bug status.'
  }
  const liveAgent = snapshot.agents.find((agent) => isAgentLive(agent))
  if (liveAgent) {
    return `${liveAgent.name} should produce a persisted checkpoint or handoff next.`
  }
  return 'A reviewed checkpoint that moves the run into the next phase.'
}

function getHumanAction(snapshot: ProjectSnapshot | null, status: SystemStatus | null) {
  if (!status?.preflight.ok) {
    return 'Resolve the Codex preflight issue before starting a run.'
  }
  if (!snapshot) {
    return 'Open Project Setup and attach the client folder and brief.'
  }
  if (!snapshot.project.copiedBriefPath) {
    return 'Attach a Markdown brief so the team has a scoped objective.'
  }
  if (!snapshot.runs.length) {
    return 'Start the first core run and let the operator summarize the plan.'
  }
  const pausedRun = snapshot.runs.find((run) => run.status === 'paused')
  if (pausedRun) {
    return 'Resume the paused run when you are ready to continue.'
  }
  const blockedAgent = snapshot.agents.find((agent) => agent.status === 'blocked')
  if (blockedAgent) {
    return `Open Agents and inspect ${blockedAgent.name} if you want the raw blocker trace.`
  }
  return 'Watch the Workspace view. Only intervene if the operator asks for a decision.'
}

function App() {
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  const [activeTab, setActiveTab] = useState<TabId>('onboarding')
  const [status, setStatus] = useState<SystemStatus | null>(hasApi() ? null : fallback.status)
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(hasApi() ? null : fallback.snapshot)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [directoryInput, setDirectoryInput] = useState('')
  const [briefInput, setBriefInput] = useState('')
  const [projectName, setProjectName] = useState('VibePlanner Workspace')
  const [projectMode, setProjectMode] = useState<'new' | 'existing'>('new')
  const [selectedAgentId, setSelectedAgentId] = useState<AgentRole>('operator')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const [agentLogs, setAgentLogs] = useState('No logs loaded.')
  const [smokeUrl, setSmokeUrl] = useState('https://example.com')
  const deferredLogs = useDeferredValue(agentLogs)
  const recoveredRootsRef = useRef<Set<string>>(new Set())
  const pollingRef = useRef(false)
  const recoverableRun = useMemo(() => findRecoverableRun(snapshot), [snapshot])
  const operatorAgent = useMemo(() => getOperatorAgent(snapshot), [snapshot])
  const leadAgent = useMemo(() => getLeadAgent(snapshot), [snapshot])
  const workflowStages = useMemo(() => deriveWorkflowStages(snapshot, status), [snapshot, status])
  const currentObjective = useMemo(() => getCurrentObjective(snapshot), [snapshot])
  const primaryBlocker = useMemo(() => getPrimaryBlocker(snapshot, status), [snapshot, status])
  const nextExpectedOutcome = useMemo(() => getNextExpectedOutcome(snapshot), [snapshot])
  const humanAction = useMemo(() => getHumanAction(snapshot, status), [snapshot, status])
  const liveAgentCount = useMemo(
    () => snapshot?.agents.filter((agent) => isAgentLive(agent)).length ?? 0,
    [snapshot],
  )
  const hasLiveExecution = useMemo(
    () => Boolean(snapshot?.runs.some((run) => run.status === 'running' || run.status === 'queued')
      || snapshot?.agents.some((agent) => isAgentLive(agent))),
    [snapshot],
  )
  const refreshProjectEvent = useEffectEvent(async (projectRoot?: string) => {
    await refreshProject(projectRoot)
  })
  const loadLogsEvent = useEffectEvent(async (agentId = selectedAgentId, projectRoot = snapshot?.project.rootPath) => {
    await loadLogs(agentId, projectRoot)
  })

  const selectedAgent = useMemo(
    () => snapshot?.agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [selectedAgentId, snapshot],
  )
  const selectedRun = useMemo(
    () => snapshot?.runs.find((run) => run.id === selectedRunId) ?? snapshot?.runs[0] ?? null,
    [selectedRunId, snapshot],
  )
  const selectedBug = useMemo(
    () => snapshot?.bugs.find((bug) => bug.id === selectedBugId) ?? snapshot?.bugs[0] ?? null,
    [selectedBugId, snapshot],
  )
  const activeProjectRoot = snapshot?.project.rootPath ?? null

  useEffect(() => {
    void bootstrap()
  }, [])

  useEffect(() => {
    if (!snapshot) {
      return
    }

    const firstAgent = snapshot.agents[0]
    const firstRun = snapshot.runs[0]
    const firstBug = snapshot.bugs[0]

    if (firstAgent) {
      setSelectedAgentId((current) =>
        snapshot.agents.some((agent) => agent.id === current) ? current : firstAgent.id,
      )
    }
    if (firstRun && !selectedRunId) {
      setSelectedRunId(firstRun.id)
    }
    if (firstBug && !selectedBugId) {
      setSelectedBugId(firstBug.id)
    }
  }, [selectedBugId, selectedRunId, snapshot])

  useEffect(() => {
    if (!activeProjectRoot || !hasApi() || activeTab !== 'agents') {
      return
    }

    void loadLogsEvent(selectedAgentId, activeProjectRoot)
  }, [activeProjectRoot, activeTab, selectedAgentId])

  useEffect(() => {
    if (!snapshot || !hasApi()) {
      return
    }

    const recoverableRun = snapshot.runs.find((run) => run.status === 'running' || run.status === 'queued')
    const projectRoot = snapshot.project.rootPath
    if (!recoverableRun || recoveredRootsRef.current.has(projectRoot)) {
      return
    }

    recoveredRootsRef.current.add(projectRoot)
    let cancelled = false

    void (async () => {
      try {
        const recovered = await window.vibeplanner!.run.recover(projectRoot)
        if (recovered && !cancelled) {
          await refreshProjectEvent(projectRoot)
          setActiveTab('dashboard')
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to recover the active run.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [snapshot])

  useEffect(() => {
    if (!snapshot || !hasApi() || busy || !hasLiveExecution) {
      return
    }

    let cancelled = false
    const interval = window.setInterval(() => {
      if (cancelled || pollingRef.current) {
        return
      }

      pollingRef.current = true
      void (async () => {
        try {
          await refreshProjectEvent(snapshot.project.rootPath)
          if (activeTab === 'agents') {
            await loadLogsEvent(selectedAgentId, snapshot.project.rootPath)
          }
        } catch {
          // Ignore transient polling errors; explicit actions still surface failures.
        } finally {
          pollingRef.current = false
        }
      })()
    }, 2500)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeTab, busy, hasLiveExecution, selectedAgentId, snapshot])

  async function bootstrap() {
    if (!hasApi()) {
      return
    }

    try {
      const nextStatus = await window.vibeplanner!.system.preflight()
      setStatus(nextStatus)
      const lastProjectRoot = window.localStorage.getItem('vibeplanner:lastProjectRoot')
      if (lastProjectRoot) {
        const loaded = await window.vibeplanner!.project.load(lastProjectRoot)
        setSnapshot(loaded)
        setDirectoryInput(loaded.project.rootPath)
        setBriefInput(loaded.project.briefPath ?? '')
        setProjectName(loaded.project.name)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to initialize VibePlanner.')
    }
  }

  async function wrapTask(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unexpected failure')
    } finally {
      setBusy(false)
    }
  }

  async function refreshProject(projectRoot?: string) {
    if (!hasApi()) {
      return
    }
    const root = projectRoot ?? snapshot?.project.rootPath
    if (!root) {
      return
    }

    const loaded = await window.vibeplanner!.project.load(root)
    setSnapshot(loaded)
    setStatus((current) => current ? { ...current, preflight: loaded.preflight } : current)
    window.localStorage.setItem('vibeplanner:lastProjectRoot', root)
  }

  async function handleProject(mode: 'new' | 'existing') {
    await wrapTask(async () => {
      const input: CreateProjectInput = {
        rootPath: directoryInput,
        name: projectName,
        repoMode: mode,
        briefPath: briefInput || null,
      }
      const nextSnapshot = mode === 'new'
        ? await window.vibeplanner!.project.create(input)
        : await window.vibeplanner!.project.attach(input)
      setSnapshot(nextSnapshot)
      setStatus((current) => current ? { ...current, preflight: nextSnapshot.preflight } : current)
      setActiveTab('dashboard')
      window.localStorage.setItem('vibeplanner:lastProjectRoot', nextSnapshot.project.rootPath)
    })
  }

  async function handleStartRun() {
    if (!snapshot || !hasApi()) {
      return
    }

    await wrapTask(async () => {
      await window.vibeplanner!.run.start({ projectRoot: snapshot.project.rootPath })
      await refreshProject()
      await loadLogs(selectedAgentId)
      setActiveTab('agents')
    })
  }

  async function handleRunMutation(run: RunSession, action: 'pause' | 'resume') {
    if (!snapshot || !hasApi()) {
      return
    }

    await wrapTask(async () => {
      if (action === 'pause') {
        await window.vibeplanner!.run.pause({ projectRoot: snapshot.project.rootPath, runId: run.id })
      } else {
        await window.vibeplanner!.run.resume({ projectRoot: snapshot.project.rootPath, runId: run.id })
      }
      await refreshProject()
    })
  }

  async function handleAgentAction(agent: AgentRecord, action: 'start' | 'stop') {
    if (!snapshot || !hasApi()) {
      return
    }

    await wrapTask(async () => {
      if (action === 'start') {
        await window.vibeplanner!.agent.start({
          projectRoot: snapshot.project.rootPath,
          agentId: agent.id,
          runId: selectedRun?.id ?? null,
        })
      } else {
        await window.vibeplanner!.agent.stop({
          projectRoot: snapshot.project.rootPath,
          agentId: agent.id,
        })
      }
      await loadLogs(agent.id)
      await refreshProject()
    })
  }

  async function loadLogs(agentId = selectedAgentId, projectRoot = snapshot?.project.rootPath) {
    if (!projectRoot || !hasApi()) {
      return
    }

    const logs = await window.vibeplanner!.agent.getLogs({
      projectRoot,
      agentId,
    })
    setAgentLogs(logs)
  }

  async function handleBugAdvance(bug: BugRecord) {
    if (!snapshot || !hasApi()) {
      return
    }

    const nextStatus = bug.status === 'submitted'
      ? 'open'
      : bug.status === 'open'
        ? 'fixing'
        : bug.status === 'fixing'
          ? 'fixed'
          : 'fixed'

    if (bug.status === 'fixed') {
      return
    }

    await wrapTask(async () => {
      await window.vibeplanner!.bug.update({
        projectRoot: snapshot.project.rootPath,
        bugId: bug.id,
        status: nextStatus,
        triagedBy: bug.triagedBy ?? 'strategy',
      })
      await refreshProject()
    })
  }

  async function handleSmokeRun() {
    if (!snapshot || !hasApi()) {
      return
    }

    await wrapTask(async () => {
      await window.vibeplanner!.testing.run({
        projectRoot: snapshot.project.rootPath,
        targetUrl: smokeUrl,
        label: 'smoke-run',
        headless: true,
      })
      await refreshProject()
      setActiveTab('agents')
    })
  }

  function switchTab(tabId: TabId) {
    startTransition(() => setActiveTab(tabId))
  }

  return (
    <div className={`app-shell ${isMac ? 'is-macos' : ''}`}>
      <aside className="nav-panel">
        <div className="brand-block">
          <div className="brand-mark">
            <Icon name="spark" className="brand-icon" />
          </div>
          <div>
            <p className="eyebrow">Codex workspace</p>
            <h1>VibePlanner</h1>
          </div>
        </div>

        <div className="project-mini">
          <div className="mini-topline">
            <span className="eyebrow">Current project</span>
            <span className="mini-chip">
              <Icon name="folder" className="inline-icon tiny-icon" />
              {snapshot?.project.repoMode ?? 'idle'}
            </span>
          </div>
          <div className="project-mini-main">
            <div className="project-orb">
              <Icon name="compass" className="panel-icon" />
            </div>
            <div>
              <strong>{snapshot?.project.name ?? 'No project attached'}</strong>
              <p className="project-location">{pathTailLabel(snapshot?.project.rootPath)}</p>
              <p className="project-path" title={snapshot?.project.rootPath ?? 'Select a directory to begin.'}>
                {compactPath(snapshot?.project.rootPath)}
              </p>
            </div>
          </div>
          <div className="project-mini-stats">
            <span>
              <Icon name="agents" className="inline-icon tiny-icon" />
              {snapshot?.agents.length ?? 0} agents
            </span>
            <span>
              <Icon name="bug" className="inline-icon tiny-icon" />
              {snapshot?.bugs.length ?? 0} bugs
            </span>
          </div>
          <div className="project-guide">
            <span className="eyebrow">Next action</span>
            <p>{humanAction}</p>
          </div>
        </div>

        <nav className="tab-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-pill ${activeTab === tab.id ? 'is-active' : ''}`}
              onClick={() => switchTab(tab.id)}
            >
              <span className="tab-pill-label">
                <Icon name={getTabIcon(tab.id)} className="nav-icon" />
                {tab.label}
              </span>
              <small>{tab.hint}</small>
            </button>
          ))}
        </nav>

        <div className="nav-footer">
          <div className={`status-badge ${status?.preflight.ok ? 'ok' : 'critical'}`}>
            {status?.preflight.ok ? 'Ready' : 'Needs attention'}
          </div>
          <p>{getStatusTone(status, busy)}</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="top-bar">
          <div className="top-bar-copy">
            <p className="eyebrow">Workspace</p>
            <div className="top-bar-meta">
              <div className="title-badge">
                <Icon name={getSectionIcon(activeTab)} className="title-icon" />
              </div>
              <h2>{getTabTitle(activeTab)}</h2>
              <div className={`status-badge ${status?.preflight.ok ? 'ok' : 'critical'}`}>
                {status?.preflight.ok ? 'Ready' : 'Blocked'}
              </div>
            </div>
            <p className="top-summary">{getTabSummary(activeTab)}</p>
            {snapshot ? (
              <p className="live-summary">
                {hasLiveExecution
                  ? `${liveAgentCount} agents active · last run ${recoverableRun?.status ?? 'running'}`
                  : 'No live execution in progress'}
              </p>
            ) : null}
            {snapshot ? (
              <p className="live-summary emphasis">
                Current objective: {currentObjective}
              </p>
            ) : null}
          </div>
          <div className="top-actions">
            <button className="secondary" onClick={() => void refreshProject()} disabled={!snapshot || busy}>
              <Icon name="refresh" className="inline-icon" />
              Refresh
            </button>
              <button className="primary" onClick={() => void handleStartRun()} disabled={!snapshot || busy}>
                <Icon name="rocket" className="inline-icon" />
                {recoverableRun
                  ? recoverableRun.status === 'paused'
                  ? 'Resume Guided Run'
                  : 'Recover Guided Run'
                : 'Start Guided Run'}
              </button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}
        <section className="content-grid">
          <div className="workspace-panel">
            {activeTab === 'onboarding' ? (
              <OnboardingView status={status} onGoProject={() => switchTab('project')} />
            ) : null}
            {activeTab === 'project' ? (
              <ProjectSetupView
                mode={projectMode}
                busy={busy}
                directoryInput={directoryInput}
                briefInput={briefInput}
                projectName={projectName}
                onModeChange={setProjectMode}
                onDirectoryChange={setDirectoryInput}
                onBriefChange={setBriefInput}
                onNameChange={setProjectName}
                onPickDirectory={() =>
                  wrapTask(async () => {
                    const selected = await window.vibeplanner?.project.pickDirectory()
                    if (selected) {
                      setDirectoryInput(selected)
                    }
                  })
                }
                onPickBrief={() =>
                  wrapTask(async () => {
                    const selected = await window.vibeplanner?.project.pickBrief()
                    if (selected) {
                      setBriefInput(selected)
                    }
                  })
                }
                onSubmit={() => void handleProject(projectMode)}
              />
            ) : null}
            {activeTab === 'dashboard' ? (
              <DashboardView
                snapshot={snapshot}
                status={status}
                workflowStages={workflowStages}
                operatorAgent={operatorAgent}
                leadAgent={leadAgent}
                currentObjective={currentObjective}
                primaryBlocker={primaryBlocker}
                nextExpectedOutcome={nextExpectedOutcome}
                humanAction={humanAction}
              />
            ) : null}
            {activeTab === 'agents' ? (
              <AgentsView
                snapshot={snapshot}
                selectedAgentId={selectedAgentId}
                onSelectAgent={(agentId) => {
                  setSelectedAgentId(agentId)
                  void loadLogs(agentId)
                }}
                onAgentAction={handleAgentAction}
                logs={deferredLogs}
              />
            ) : null}
            {activeTab === 'bugs' ? (
              <BugsView
                snapshot={snapshot}
                selectedBugId={selectedBugId}
                onSelectBug={setSelectedBugId}
                onAdvance={handleBugAdvance}
              />
            ) : null}
            {activeTab === 'research' ? (
              <ResearchView snapshot={snapshot} />
            ) : null}
            {activeTab === 'runs' ? (
              <RunsView
                snapshot={snapshot}
                selectedRunId={selectedRunId}
                onSelectRun={setSelectedRunId}
                onMutateRun={handleRunMutation}
              />
            ) : null}
            {activeTab === 'settings' ? (
              <SettingsView
                snapshot={snapshot}
                smokeUrl={smokeUrl}
                onSmokeUrlChange={setSmokeUrl}
                onSmokeRun={() => void handleSmokeRun()}
              />
            ) : null}
          </div>

          <aside className="inspector-panel">
            <InspectorView
              activeTab={activeTab}
              snapshot={snapshot}
              status={status}
              selectedAgent={selectedAgent}
              selectedRun={selectedRun}
              selectedBug={selectedBug}
              logs={deferredLogs}
            />
          </aside>
        </section>
      </main>
    </div>
  )
}

function OnboardingView({
  status,
  onGoProject,
}: {
  status: SystemStatus | null
  onGoProject: () => void
}) {
  return (
    <section className="stack">
      <section className="hero-strip">
        <div className="hero-strip-badge">
          <Icon name="spark" className="section-icon" />
        </div>
        <div className="hero-strip-copy">
          <p className="eyebrow">Ready check</p>
          <h3>Make sure Codex is awake before the team starts moving.</h3>
          <div className="hero-strip-tags">
            <span>CLI</span>
            <span>Auth</span>
            <span>Browser lane</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge">
              <Icon name="shield" className="section-icon" />
            </div>
            <div>
            <p className="eyebrow">Codex</p>
            <h3>Desktop readiness</h3>
            </div>
          </div>
          <div className={`status-badge ${status?.preflight.ok ? 'ok' : 'critical'}`}>
            {status?.preflight.ok ? 'Ready' : 'Blocked'}
          </div>
        </div>
        <p className="section-copy">
          Verify Codex first, then move to Project Setup and attach a folder. The app should only
          feel actionable once this gate is clear.
        </p>
        <dl className="detail-list">
          <div>
            <dt>Codex path</dt>
            <dd>{status?.codexPath ?? 'Missing'}</dd>
          </div>
          <div>
            <dt>Path source</dt>
            <dd>{status?.codexPathSource ?? 'Unresolved'}</dd>
          </div>
          <div>
            <dt>Login</dt>
            <dd>{status?.preflight.loginState ?? 'unknown'}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{status?.preflight.detectedVersion ?? 'unknown'}</dd>
          </div>
          <div>
            <dt>Shell</dt>
            <dd>{status?.shellPath ?? 'unknown'}</dd>
          </div>
          <div>
            <dt>Browser lane</dt>
            <dd>{status?.browserReady ? 'Ready' : 'Unavailable'}</dd>
          </div>
        </dl>
        <div className="button-row">
          <button className="primary" onClick={onGoProject}>
            <Icon name="chevron" className="inline-icon" />
            Go to Project Setup
          </button>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h4>Preflight issues</h4>
        </div>
        <ul className="plain-list">
          {status?.preflight.issues.length ? (
            status.preflight.issues.map((issue) => <li key={issue}>{issue}</li>)
          ) : (
            <li>Codex is installed, logged in, and at or above the supported minimum version.</li>
          )}
        </ul>
        {status?.preflight.guidance.length ? (
          <ul className="plain-list secondary-list">
            {status.preflight.guidance.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
      </section>

      <div className="split-section">
        <section className="section-block">
          <div className="section-heading">
            <h4>Login output</h4>
          </div>
          <pre className="output-block">{status?.loginStatusOutput?.trim() || 'No output'}</pre>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <h4>Version output</h4>
          </div>
          <pre className="output-block">{status?.versionOutput?.trim() || 'No output'}</pre>
        </section>
      </div>
    </section>
  )
}

interface ProjectSetupViewProps {
  mode: 'new' | 'existing'
  busy: boolean
  directoryInput: string
  briefInput: string
  projectName: string
  onModeChange: (value: 'new' | 'existing') => void
  onDirectoryChange: (value: string) => void
  onBriefChange: (value: string) => void
  onNameChange: (value: string) => void
  onPickDirectory: () => Promise<void>
  onPickBrief: () => Promise<void>
  onSubmit: () => void
}

function ProjectSetupView(props: ProjectSetupViewProps) {
  return (
    <section className="stack">
      <section className="hero-strip project-hero">
        <div className="hero-strip-badge">
          <Icon name="folder" className="section-icon" />
        </div>
        <div className="hero-strip-copy">
          <p className="eyebrow">Workspace shape</p>
          <h3>Point VibePlanner at the folder where the real work should happen.</h3>
          <div className="hero-strip-tags">
            <span>New repo</span>
            <span>Existing repo</span>
            <span>Markdown brief</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge">
              <Icon name="folder" className="section-icon" />
            </div>
            <div>
            <p className="eyebrow">Project</p>
            <h3>Choose where Codex should work</h3>
            </div>
          </div>
        </div>
        <p className="section-copy">
          Pick one folder, define whether it is new or existing, then attach the Markdown brief.
          VibePlanner will treat that location as the only approved execution area.
        </p>

        <div className="form-grid">
          <label>
            <span>Project name</span>
            <input value={props.projectName} onChange={(event) => props.onNameChange(event.target.value)} />
          </label>
          <label>
            <span>Mode</span>
            <select value={props.mode} onChange={(event) => props.onModeChange(event.target.value as 'new' | 'existing')}>
              <option value="new">New project</option>
              <option value="existing">Existing repository</option>
            </select>
          </label>
        </div>

        <div className="field-group">
          <label>
            <span>Project directory</span>
            <div className="inline-field">
              <input value={props.directoryInput} onChange={(event) => props.onDirectoryChange(event.target.value)} />
              <button className="secondary" onClick={() => void props.onPickDirectory()} disabled={props.busy}>
                <Icon name="folder" className="inline-icon" />
                Browse
              </button>
            </div>
          </label>

          <label>
            <span>Markdown brief</span>
            <div className="inline-field">
              <input value={props.briefInput} onChange={(event) => props.onBriefChange(event.target.value)} />
              <button className="secondary" onClick={() => void props.onPickBrief()} disabled={props.busy}>
                <Icon name="search" className="inline-icon" />
                Select
              </button>
            </div>
          </label>
        </div>

        <div className="section-subblock">
          <h4>Workspace impact</h4>
          <ul className="plain-list">
            <li>Creates the operator plus the core build agents, then seeds bugs, runs, messages, and artifacts.</li>
            <li>Initializes Git automatically for new projects.</li>
            <li>Copies the brief into the local workspace so Codex can access it safely.</li>
            <li>Locks agent autonomy to the approved project root using Codex workspace-write sandboxing.</li>
          </ul>
        </div>

        <div className="button-row">
          <button className="primary" onClick={props.onSubmit} disabled={props.busy || !props.directoryInput}>
            <Icon name={props.mode === 'new' ? 'spark' : 'folder'} className="inline-icon" />
            {props.mode === 'new' ? 'Create Project' : 'Attach Repository'}
          </button>
        </div>
      </section>
    </section>
  )
}

function DashboardView({
  snapshot,
  status,
  workflowStages,
  operatorAgent,
  leadAgent,
  currentObjective,
  primaryBlocker,
  nextExpectedOutcome,
  humanAction,
}: {
  snapshot: ProjectSnapshot | null
  status: SystemStatus | null
  workflowStages: WorkflowStage[]
  operatorAgent: AgentRecord | null
  leadAgent: AgentRecord | null
  currentObjective: string
  primaryBlocker: string
  nextExpectedOutcome: string
  humanAction: string
}) {
  if (!snapshot) {
    return <EmptyState title="No project attached" body="Open Project Setup to attach a repo or create a new workspace." />
  }

  return (
    <section className="stack">
      <section className="hero-strip dashboard-hero">
        <div className="hero-strip-badge">
          <Icon name="chat" className="section-icon" />
        </div>
        <div className="hero-strip-copy">
          <p className="eyebrow">Operator summary</p>
          <h3>{operatorAgent?.activitySummary ?? 'The operator will summarize the run here once work starts.'}</h3>
          <div className="hero-strip-tags">
            <span>{workflowStages.find((stage) => stage.state === 'active')?.label ?? 'Ready'}</span>
            <span>{leadAgent?.name ?? 'No active lead'}</span>
            <span>{snapshot.bugs.filter((bug) => bug.status !== 'fixed').length} open issues</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-grid">
              <Icon name="grid" className="section-icon" />
            </div>
            <h3>Guided lane</h3>
          </div>
        </div>
        <div className="workflow-strip">
          {workflowStages.map((stage) => (
            <div key={stage.id} className={`workflow-step is-${stage.state}`}>
              <span>{stage.label}</span>
            </div>
          ))}
        </div>
        <div className="guided-grid">
          <section className="guided-card">
            <p className="eyebrow">Current objective</p>
            <h4>{currentObjective}</h4>
            <p>{leadAgent ? `${leadAgent.name} is the current lead.` : 'No active lead agent yet.'}</p>
          </section>
          <section className="guided-card">
            <p className="eyebrow">Next expected outcome</p>
            <h4>{nextExpectedOutcome}</h4>
            <p>The operator should turn the next checkpoint into a plain-English summary.</p>
          </section>
          <section className="guided-card">
            <p className="eyebrow">Primary blocker</p>
            <h4>{primaryBlocker}</h4>
            <p>{status?.preflight.ok ? 'If this changes, the operator summary should update automatically.' : 'Resolve setup before running the team.'}</p>
          </section>
          <section className="guided-card">
            <p className="eyebrow">Human action</p>
            <h4>{humanAction}</h4>
            <p>This is the only thing the human should need to think about right now.</p>
          </section>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-agents">
              <Icon name="agents" className="section-icon" />
            </div>
            <h4>Live team heartbeat</h4>
          </div>
        </div>
        <div className="heartbeat-list">
          {snapshot.agents.map((agent) => (
            <div key={agent.id} className="heartbeat-row">
              <div className="row-main">
                <div className={`row-icon tone-${agent.status}`}>
                  <Icon name={getAgentIcon(agent.id)} className="row-glyph" />
                </div>
                <div>
                  <strong>{agent.name}</strong>
                  <p>{agent.activitySummary}</p>
                </div>
              </div>
              <div className="heartbeat-meta">
                <div className={`status-badge ${agent.status}`}>{agent.status}</div>
                <small>{formatRelativeTime(agent.lastActivityAt)}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-spark">
              <Icon name="spark" className="section-icon" />
            </div>
            <h4>Recent coordination</h4>
          </div>
        </div>
        <div className="timeline">
          {snapshot.messages.slice(0, 6).map((message) => (
            <div key={message.id} className="timeline-item">
              <span>{formatDate(message.createdAt)}</span>
              <strong>{message.from} → {message.to}</strong>
              <p>{message.body}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

function AgentsView({
  snapshot,
  selectedAgentId,
  onSelectAgent,
  onAgentAction,
  logs,
}: {
  snapshot: ProjectSnapshot | null
  selectedAgentId: AgentRole
  onSelectAgent: (agentId: AgentRole) => void
  onAgentAction: (agent: AgentRecord, action: 'start' | 'stop') => Promise<void>
  logs: string
}) {
  if (!snapshot) {
    return <EmptyState title="No agents yet" body="Attach a project to seed the core team." />
  }

  return (
    <section className="stack">
      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-agents">
              <Icon name="agents" className="section-icon" />
            </div>
            <h3>Core agents</h3>
          </div>
        </div>
        {snapshot.agents.map((agent) => (
          <button
            key={agent.id}
            className={`agent-row ${selectedAgentId === agent.id ? 'is-active' : ''}`}
            onClick={() => onSelectAgent(agent.id)}
          >
            <div className="agent-row-main">
              <div className="row-main">
                <div className={`row-icon tone-${agent.status}`}>
                  <Icon name={getAgentIcon(agent.id)} className="row-glyph" />
                </div>
                <div>
                  <strong>{agent.name}</strong>
                  <p>{agent.roleLabel}</p>
                </div>
              </div>
              <div className="agent-row-copy">
                <p>{agent.activitySummary}</p>
                <div className="agent-row-meta">
                  <span>{formatRelativeTime(agent.lastActivityAt)}</span>
                  <span>{agent.progress}%</span>
                  <span>{agent.resumeCount} resumes</span>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(4, agent.progress)}%` }} />
                </div>
              </div>
            </div>
            <div className={`status-badge ${agent.status}`}>{agent.status}</div>
          </button>
        ))}
      </section>

      <div className="button-row compact-row">
        {snapshot.agents
          .filter((agent) => agent.id === selectedAgentId)
          .map((agent) => (
            <div key={agent.id} className="button-row">
              <button className="primary" onClick={() => void onAgentAction(agent, 'start')}>
                <Icon name="play" className="inline-icon" />
                Launch Agent
              </button>
              <button className="secondary" onClick={() => void onAgentAction(agent, 'stop')}>
                <Icon name="terminal" className="inline-icon" />
                Stop Agent
              </button>
            </div>
          ))}
      </div>

      <section className="section-block flush-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-terminal">
              <Icon name="terminal" className="section-icon" />
            </div>
            <h4>Agent log stream</h4>
          </div>
          <small>Latest stdout/stderr</small>
        </div>
        <pre className="terminal-output">{logs}</pre>
      </section>
    </section>
  )
}

function BugsView({
  snapshot,
  selectedBugId,
  onSelectBug,
  onAdvance,
}: {
  snapshot: ProjectSnapshot | null
  selectedBugId: string | null
  onSelectBug: (bugId: string) => void
  onAdvance: (bug: BugRecord) => Promise<void>
}) {
  if (!snapshot) {
    return <EmptyState title="No bug queue" body="Attach a project to start collecting testing output." />
  }

  if (snapshot.bugs.length === 0) {
    return <EmptyState title="No bugs yet" body="Testing agents have not filed any bugs for this workspace yet." />
  }

  return (
    <section className="stack">
      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-bug">
              <Icon name="bug" className="section-icon" />
            </div>
            <h3>Bug queue</h3>
          </div>
        </div>
        {snapshot.bugs.map((bug) => (
          <button
            key={bug.id}
            className={`bug-row ${selectedBugId === bug.id ? 'is-active' : ''}`}
            onClick={() => onSelectBug(bug.id)}
          >
            <div className="row-main">
              <div className={`row-icon tone-${bug.severity}`}>
                <Icon name="bug" className="row-glyph" />
              </div>
              <div>
              <strong>{bug.title}</strong>
              <p>{bug.assignedTo ?? 'Unassigned'}</p>
              </div>
            </div>
            <div className={`status-badge ${bug.severity}`}>{bug.severity}</div>
          </button>
        ))}
      </section>

      {snapshot.bugs
        .filter((bug) => bug.id === selectedBugId || (!selectedBugId && snapshot.bugs[0]?.id === bug.id))
        .map((bug) => (
          <section className="section-block" key={bug.id}>
            <div className="section-heading">
              <h4>{bug.title}</h4>
              <div className={`status-badge ${bug.status}`}>{bug.status}</div>
            </div>
            <p className="section-copy">{bug.details || 'No implementation details recorded yet.'}</p>
            <div className="meta-grid">
              <span>Status: {bug.status}</span>
              <span>Discovered by: {bug.discoveredBy}</span>
              <span>Triaged by: {bug.triagedBy ?? 'Pending'}</span>
              <span>Assigned to: {bug.assignedTo ?? 'Pending'}</span>
            </div>
            <p className="section-copy">{bug.reproduction || 'No reproduction steps recorded yet.'}</p>
            <button className="primary" onClick={() => void onAdvance(bug)} disabled={bug.status === 'fixed'}>
              <Icon name="chevron" className="inline-icon" />
              Advance Status
            </button>
          </section>
        ))}
    </section>
  )
}

function ResearchView({ snapshot }: { snapshot: ProjectSnapshot | null }) {
  if (!snapshot) {
    return <EmptyState title="No research yet" body="Attach a project to start collecting references." />
  }

  return (
    <section className="stack">
      {snapshot.research.map((source) => (
        <section key={source.id} className="section-block">
          <div className="section-heading">
            <div className="heading-with-icon">
              <div className="section-icon-badge accent-research">
                <Icon name="compass" className="section-icon" />
              </div>
              <div>
              <p className="eyebrow">{source.kind}</p>
              <h4>{source.title}</h4>
              </div>
            </div>
            <a href={source.url} target="_blank" rel="noreferrer">
              <Icon name="chevron" className="inline-icon" />
              Open source
            </a>
          </div>
          <p className="section-copy">{source.notes}</p>
          <ul className="plain-list">
            {source.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}
          </ul>
        </section>
      ))}
    </section>
  )
}

function RunsView({
  snapshot,
  selectedRunId,
  onSelectRun,
  onMutateRun,
}: {
  snapshot: ProjectSnapshot | null
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
  onMutateRun: (run: RunSession, action: 'pause' | 'resume') => Promise<void>
}) {
  if (!snapshot) {
    return <EmptyState title="No runs recorded" body="Start a core run after attaching a project." />
  }

  return (
    <section className="stack">
      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-run">
              <Icon name="rocket" className="section-icon" />
            </div>
            <h3>Runs</h3>
          </div>
        </div>
        {snapshot.runs.map((run) => (
          <button
            key={run.id}
            className={`run-row ${selectedRunId === run.id ? 'is-active' : ''}`}
            onClick={() => onSelectRun(run.id)}
          >
            <div className="row-main">
              <div className={`row-icon tone-${run.status}`}>
                <Icon name="run" className="row-glyph" />
              </div>
              <div>
              <strong>{run.title}</strong>
              <p>{run.phase}</p>
              </div>
            </div>
            <div className={`status-badge ${run.status}`}>{run.status}</div>
          </button>
        ))}
      </section>

      {snapshot.runs
        .filter((run) => run.id === selectedRunId || (!selectedRunId && snapshot.runs[0]?.id === run.id))
        .map((run) => (
          <section className="section-block" key={run.id}>
            <div className="section-heading">
              <h4>{run.title}</h4>
              <div className={`status-badge ${run.status}`}>{run.status}</div>
            </div>
            <p className="section-copy">{run.summary}</p>
            <div className="meta-grid">
              <span>Started: {formatDate(run.startedAt)}</span>
              <span>Updated: {formatDate(run.updatedAt)}</span>
            </div>
            <div className="button-row">
              {run.status === 'running' ? (
                <button className="secondary" onClick={() => void onMutateRun(run, 'pause')}>
                  <Icon name="terminal" className="inline-icon" />
                  Pause Run
                </button>
              ) : null}
              {run.status === 'paused' ? (
                <button className="primary" onClick={() => void onMutateRun(run, 'resume')}>
                  <Icon name="rocket" className="inline-icon" />
                  Resume Run
                </button>
              ) : null}
            </div>
          </section>
        ))}
    </section>
  )
}

function SettingsView({
  snapshot,
  smokeUrl,
  onSmokeUrlChange,
  onSmokeRun,
}: {
  snapshot: ProjectSnapshot | null
  smokeUrl: string
  onSmokeUrlChange: (value: string) => void
  onSmokeRun: () => void
}) {
  if (!snapshot) {
    return <EmptyState title="No settings context" body="Attach a project to manage runtime policy." />
  }

  return (
    <section className="stack">
      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-settings">
              <Icon name="settings" className="section-icon" />
            </div>
            <div>
            <p className="eyebrow">Codex runtime</p>
            <h4>{snapshot.project.codexRuntime.model} / {snapshot.project.codexRuntime.reasoningEffort}</h4>
            </div>
          </div>
        </div>
        <ul className="plain-list">
          <li>Sandbox: {snapshot.project.codexRuntime.sandboxMode}</li>
          <li>Approval policy: {snapshot.project.codexRuntime.approvalPolicy}</li>
          <li>Web search: {snapshot.project.codexRuntime.enableSearch ? 'enabled' : 'disabled'}</li>
          <li>Minimum Codex version: {snapshot.project.codexRuntime.minimumVersion}</li>
        </ul>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-play">
              <Icon name="flask" className="section-icon" />
            </div>
            <div>
            <p className="eyebrow">Browser smoke check</p>
            <h4>Playwright target</h4>
            </div>
          </div>
        </div>
        <div className="inline-field">
          <input value={smokeUrl} onChange={(event) => onSmokeUrlChange(event.target.value)} />
          <button className="primary" onClick={onSmokeRun}>
            <Icon name="play" className="inline-icon" />
            Run Playwright
          </button>
        </div>
      </section>
    </section>
  )
}

function InspectorView({
  activeTab,
  snapshot,
  status,
  selectedAgent,
  selectedRun,
  selectedBug,
  logs,
}: {
  activeTab: TabId
  snapshot: ProjectSnapshot | null
  status: SystemStatus | null
  selectedAgent: AgentRecord | null
  selectedRun: RunSession | null
  selectedBug: BugRecord | null
  logs: string
}) {
  return (
    <div className="stack">
      <section className="section-block inspector-block">
        <p className="eyebrow">Inspector</p>
        {!selectedAgent && !selectedRun && !selectedBug && activeTab !== 'onboarding' && activeTab !== 'dashboard' ? (
          <>
            <h4>{getTabTitle(activeTab)}</h4>
            <p>{getTabSummary(activeTab)}</p>
          </>
        ) : null}
        {activeTab === 'agents' && selectedAgent ? (
          <>
            <h4>{selectedAgent.name}</h4>
            <p>{selectedAgent.focus}</p>
            <ul className="plain-list">
              <li>Status: {selectedAgent.status}</li>
              <li>Queue: {selectedAgent.queue}</li>
              <li>Progress: {selectedAgent.progress}%</li>
              <li>Last heartbeat: {formatRelativeTime(selectedAgent.lastActivityAt)}</li>
              <li>Resume count: {selectedAgent.resumeCount}</li>
              <li>PID: {selectedAgent.pid ?? 'inactive'}</li>
            </ul>
            <p className="inspector-summary">{selectedAgent.activitySummary}</p>
            <p className="inspector-summary muted">{selectedAgent.lastUpdate}</p>
          </>
        ) : null}
        {activeTab === 'runs' && selectedRun ? (
          <>
            <h4>{selectedRun.title}</h4>
            <p>{selectedRun.summary}</p>
            <ul className="plain-list">
              <li>Updated: {formatDate(selectedRun.updatedAt)}</li>
              <li>Last agent activity: {formatRelativeTime(selectedRun.lastAgentActivityAt)}</li>
              <li>Resume count: {selectedRun.resumeCount}</li>
              {selectedRun.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              {selectedRun.blockers.length === 0 ? <li>No blockers recorded.</li> : null}
            </ul>
          </>
        ) : null}
        {activeTab === 'bugs' && selectedBug ? (
          <>
            <h4>{selectedBug.title}</h4>
            <p>{selectedBug.reproduction || 'No reproduction steps recorded yet.'}</p>
            <ul className="plain-list">
              {(selectedBug.evidencePaths ?? []).length > 0
                ? (selectedBug.evidencePaths ?? []).map((path) => <li key={path}>{path}</li>)
                : <li>No evidence attached yet.</li>}
            </ul>
          </>
        ) : null}
        {activeTab === 'onboarding' ? (
          <>
            <h4>Environment status</h4>
            <p>{status?.preflight.ok ? 'Codex and browser lane are ready.' : 'The environment still has blockers.'}</p>
          </>
        ) : null}
        {activeTab === 'dashboard' && snapshot ? (
          <>
            <h4>Workspace details</h4>
            <ul className="plain-list">
              <li>Repo mode: {snapshot.project.repoMode}</li>
              <li>Workspace: {snapshot.project.workspacePath}</li>
              <li>Brief copy: {snapshot.project.copiedBriefPath ?? 'Not attached'}</li>
              <li>Operator: {getOperatorAgent(snapshot)?.activitySummary ?? 'No operator summary yet.'}</li>
              <li>Next human action: {getHumanAction(snapshot, status)}</li>
            </ul>
          </>
        ) : null}
      </section>

      <section className="section-block flush-block">
        <div className="section-heading">
          <div className="heading-with-icon">
            <div className="section-icon-badge accent-terminal">
              <Icon name="terminal" className="section-icon" />
            </div>
            <h4>Recent output</h4>
          </div>
          <small>Inspector tail</small>
        </div>
        <pre className="terminal-output compact">{logs}</pre>
      </section>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="section-block empty-state">
      <div className="empty-badge">
        <Icon name="spark" className="section-icon" />
      </div>
      <h4>{title}</h4>
      <p>{body}</p>
    </section>
  )
}

export default App
