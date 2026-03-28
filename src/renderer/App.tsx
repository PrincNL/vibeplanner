import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
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
const sidebarGroups: Array<{ label: string; ids: TabId[] }> = [
  { label: 'Setup', ids: ['onboarding', 'project'] },
  { label: 'Operate', ids: ['dashboard', 'agents'] },
  { label: 'Review', ids: ['bugs', 'research', 'runs', 'settings'] },
]

function hasApi() {
  return typeof window !== 'undefined' && Boolean(window.vibeplanner)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function getTabTitle(tabId: TabId) {
  return tabs.find((tab) => tab.id === tabId)?.label ?? 'Workspace'
}

function getTabSummary(tabId: TabId) {
  switch (tabId) {
    case 'onboarding':
      return 'Verify Codex, understand the flow, then move into project setup.'
    case 'project':
      return 'Choose the folder, repo mode, and Markdown brief that define the workspace.'
    case 'dashboard':
      return 'Track run health, blockers, and the overall state of the agent team.'
    case 'agents':
      return 'Inspect agent state, launch or stop workers, and read live execution logs.'
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

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('onboarding')
  const [status, setStatus] = useState<SystemStatus | null>(hasApi() ? null : fallback.status)
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(hasApi() ? null : fallback.snapshot)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [directoryInput, setDirectoryInput] = useState('')
  const [briefInput, setBriefInput] = useState('')
  const [projectName, setProjectName] = useState('VibePlanner Workspace')
  const [projectMode, setProjectMode] = useState<'new' | 'existing'>('new')
  const [selectedAgentId, setSelectedAgentId] = useState<AgentRole>('strategy')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const [agentLogs, setAgentLogs] = useState('No logs loaded.')
  const [smokeUrl, setSmokeUrl] = useState('https://example.com')
  const deferredLogs = useDeferredValue(agentLogs)

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
      setActiveTab('runs')
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

  async function loadLogs(agentId = selectedAgentId) {
    if (!snapshot || !hasApi()) {
      return
    }

    const logs = await window.vibeplanner!.agent.getLogs({
      projectRoot: snapshot.project.rootPath,
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
    <div className="app-shell">
      <aside className="nav-panel">
        <div className="brand-block">
          <div className="brand-mark">VP</div>
          <div>
            <p className="eyebrow">Desktop orchestration</p>
            <h1>VibePlanner</h1>
          </div>
        </div>

        <div className="project-mini">
          <span className="eyebrow">Current project</span>
          <strong>{snapshot?.project.name ?? 'No project attached'}</strong>
          <p>{snapshot?.project.rootPath ?? 'Select a directory to begin.'}</p>
        </div>

        <nav className="sidebar-groups">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-group-label">{group.label}</p>
              <div className="tab-nav">
                {group.ids.map((tabId) => {
                  const tab = tabs.find((entry) => entry.id === tabId)
                  if (!tab) {
                    return null
                  }

                  return (
                    <button
                      key={tab.id}
                      className={`tab-pill ${activeTab === tab.id ? 'is-active' : ''}`}
                      onClick={() => switchTab(tab.id)}
                    >
                      <span>{tab.label}</span>
                      <small>{tab.hint}</small>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="nav-footer">
          <div className={`status-badge ${status?.preflight.ok ? 'ok' : 'critical'}`}>
            {status?.preflight.ok ? 'Ready' : 'Needs attention'}
          </div>
          <p>{busy ? 'Working…' : snapshot ? 'Workspace loaded' : 'Waiting for setup'}</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="top-bar">
          <div className="top-bar-copy">
            <p className="eyebrow">Workspace</p>
            <h2>{getTabTitle(activeTab)}</h2>
            <p className="top-summary">{getTabSummary(activeTab)}</p>
          </div>
          <div className="top-actions">
            <button className="secondary" onClick={() => void refreshProject()} disabled={!snapshot || busy}>
              Refresh
            </button>
            <button className="primary" onClick={() => void handleStartRun()} disabled={!snapshot || busy}>
              Start Core Run
            </button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <OverviewStrip snapshot={snapshot} status={status} activeTab={activeTab} />

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
              <DashboardView snapshot={snapshot} status={status} />
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
      <article className="hero-card">
        <p className="eyebrow">How it works</p>
        <h3>Use Codex locally in 3 steps</h3>
        <p>
          1. Verify Codex CLI and ChatGPT login.
          2. Attach a repo or create one and add your Markdown brief.
          3. Start a core run so VibePlanner launches the agent team in that folder.
        </p>
        <div className="button-row">
          <button className="primary" onClick={onGoProject}>Go to Project Setup</button>
        </div>
      </article>

      <div className="workflow-grid">
        <WorkflowStep
          step="01"
          title="Verify Codex"
          body="Check that Codex CLI is installed, logged in, and available to the desktop app."
          tone={status?.preflight.ok ? 'ok' : 'warning'}
        />
        <WorkflowStep
          step="02"
          title="Choose a project"
          body="Point VibePlanner at a new folder or an existing repository, then attach the brief."
          tone="neutral"
        />
        <WorkflowStep
          step="03"
          title="Launch the team"
          body="Start a core run and let the strategy, dev, test, and production agents begin work."
          tone="neutral"
        />
      </div>

      <div className="card-grid two-up">
        <MetricCard
          label="Codex path"
          value={status?.codexPath ?? 'Missing'}
          tone={status?.preflight.ok ? 'ok' : 'critical'}
          detail={status?.codexPathSource ? `Resolved via ${status.codexPathSource}` : 'Install required'}
        />
        <MetricCard
          label="Login"
          value={status?.preflight.loginState ?? 'unknown'}
          tone={status?.preflight.loginState === 'logged-in' ? 'ok' : 'warning'}
          detail="ChatGPT-authenticated Codex session"
        />
        <MetricCard
          label="Version"
          value={status?.preflight.detectedVersion ?? 'unknown'}
          tone={status?.preflight.detectedVersion ? 'neutral' : 'warning'}
          detail="Detected from local Codex install"
        />
        <MetricCard
          label="Next step"
          value={status?.preflight.ok ? 'Attach project' : 'Fix Codex detection'}
          tone={status?.preflight.ok ? 'ok' : 'warning'}
          detail={status?.preflight.ok ? 'Open Project Setup and choose a folder' : 'Use the details below'}
        />
      </div>

      <article className="info-card">
        <h4>Detected environment</h4>
        <div className="meta-grid">
          <span>Shell: {status?.shellPath ?? 'unknown'}</span>
          <span>Platform: {status?.platform ?? 'unknown'}</span>
          <span>Browser lane: {status?.browserReady ? 'Ready' : 'Unavailable'}</span>
        </div>
      </article>

      <div className="card-grid two-up">
        <MetricCard
          label="Raw login output"
          value={status?.loginStatusOutput?.trim() || 'No output'}
          tone="neutral"
          detail="Direct result from `codex login status`"
        />
        <MetricCard
          label="Raw version output"
          value={status?.versionOutput?.trim() || 'No output'}
          tone="neutral"
          detail="Direct result from `codex --version`"
        />
      </div>

      <article className="info-card">
        <h4>Preflight gate</h4>
        <ul className="plain-list">
          {status?.preflight.issues.length ? (
            status.preflight.issues.map((issue) => <li key={issue}>{issue}</li>)
          ) : (
            <li>Codex is installed, logged in, and at or above the supported minimum version.</li>
          )}
        </ul>
        {status?.preflight.guidance.length ? (
          <ul className="plain-list">
            {status.preflight.guidance.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
      </article>
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
      <article className="info-card">
        <p className="eyebrow">Bootstrap</p>
        <h3>Choose where Codex should work</h3>
        <p>
          Pick a folder, choose `New project` or `Existing repository`, add the Markdown brief, and
          VibePlanner will prepare the workspace and treat that folder as Codex's safe execution area.
        </p>
      </article>

      <div className="workflow-grid">
        <WorkflowStep
          step="01"
          title="Select folder"
          body="This becomes the project root and the only directory agents are allowed to modify."
          tone="neutral"
        />
        <WorkflowStep
          step="02"
          title="Attach brief"
          body="The Markdown brief is copied into `vibeplanner/artifacts` so every agent can reference it."
          tone="neutral"
        />
        <WorkflowStep
          step="03"
          title="Create workspace"
          body="VibePlanner seeds the agent folders, state files, bug inbox, runs, and messages."
          tone="neutral"
        />
      </div>

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
              Browse
            </button>
          </div>
        </label>

        <label>
          <span>Markdown brief</span>
          <div className="inline-field">
            <input value={props.briefInput} onChange={(event) => props.onBriefChange(event.target.value)} />
            <button className="secondary" onClick={() => void props.onPickBrief()} disabled={props.busy}>
              Select
            </button>
          </div>
        </label>
      </div>

      <article className="checklist-card">
        <h4>Workspace impact</h4>
        <ul className="plain-list">
          <li>Creates the fixed 7 core agent folders plus bugs, runs, messages, and artifacts.</li>
          <li>Initializes Git automatically for new projects.</li>
          <li>Copies the brief into the local workspace so Codex can access it safely.</li>
          <li>Locks agent autonomy to the approved project root using Codex workspace-write sandboxing.</li>
        </ul>
      </article>

      <div className="button-row">
        <button className="primary" onClick={props.onSubmit} disabled={props.busy || !props.directoryInput}>
          {props.mode === 'new' ? 'Create Project' : 'Attach Repository'}
        </button>
      </div>
    </section>
  )
}

function DashboardView({
  snapshot,
  status,
}: {
  snapshot: ProjectSnapshot | null
  status: SystemStatus | null
}) {
  if (!snapshot) {
    return <EmptyState title="No project attached" body="Open Project Setup to attach a repo or create a new workspace." />
  }

  return (
    <section className="stack">
      <article className="hero-card compact-hero">
        <p className="eyebrow">Live picture</p>
        <h3>{snapshot.project.name}</h3>
        <p>
          {snapshot.runs[0]?.summary ??
            'No run started yet. Finish setup, then start a core run to activate the team.'}
        </p>
      </article>

      <div className="card-grid two-up">
        <MetricCard label="Active agents" value={String(snapshot.agents.filter((agent) => agent.status !== 'idle').length)} tone="ok" detail="Core team visibility" />
        <MetricCard label="Bugs" value={String(snapshot.bugs.length)} tone={snapshot.bugs.some((bug) => bug.severity === 'critical') ? 'critical' : 'warning'} detail="Manager-triaged queue" />
        <MetricCard label="Runs" value={String(snapshot.runs.length)} tone="neutral" detail="Immutable history" />
        <MetricCard label="Preflight" value={status?.preflight.ok ? 'Clear' : 'Blocked'} tone={status?.preflight.ok ? 'ok' : 'critical'} detail="Codex version and login gate" />
      </div>

      <article className="info-card">
        <h4>Live execution picture</h4>
        <div className="timeline">
          {snapshot.messages.slice(0, 6).map((message) => (
            <div key={message.id} className="timeline-item">
              <span>{formatDate(message.createdAt)}</span>
              <strong>{message.from} → {message.to}</strong>
              <p>{message.body}</p>
            </div>
          ))}
        </div>
      </article>
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
      <article className="info-card">
        <p className="eyebrow">Agent workspace</p>
        <h4>Pick an agent, inspect its state, then launch or stop it</h4>
        <p>Use the list below to move between agents. The log panel always shows the currently selected agent.</p>
      </article>

      <div className="list-card">
        {snapshot.agents.map((agent) => (
          <button
            key={agent.id}
            className={`agent-row ${selectedAgentId === agent.id ? 'is-active' : ''}`}
            onClick={() => onSelectAgent(agent.id)}
          >
            <div>
              <strong>{agent.name}</strong>
              <p>{agent.roleLabel}</p>
            </div>
            <div className={`status-badge ${agent.status}`}>{agent.status}</div>
          </button>
        ))}
      </div>

      <div className="button-row">
        {snapshot.agents
          .filter((agent) => agent.id === selectedAgentId)
          .map((agent) => (
            <div key={agent.id} className="button-row">
              <button className="primary" onClick={() => void onAgentAction(agent, 'start')}>
                Launch Agent
              </button>
              <button className="secondary" onClick={() => void onAgentAction(agent, 'stop')}>
                Stop Agent
              </button>
            </div>
          ))}
      </div>

      <article className="terminal-card">
        <div className="terminal-header">
          <span>Agent log stream</span>
          <small>Latest stdout/stderr</small>
        </div>
        <pre>{logs}</pre>
      </article>
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

  return (
    <section className="stack">
      <article className="info-card">
        <p className="eyebrow">Bug queue</p>
        <h4>Testing files bugs here before they move into fixes</h4>
        <p>Open a bug to see its details, severity, owner, and progress through the lifecycle.</p>
      </article>

      <div className="list-card">
        {snapshot.bugs.map((bug) => (
          <button
            key={bug.id}
            className={`bug-row ${selectedBugId === bug.id ? 'is-active' : ''}`}
            onClick={() => onSelectBug(bug.id)}
          >
            <div>
              <strong>{bug.title}</strong>
              <p>{bug.assignedTo ?? 'Unassigned'}</p>
            </div>
            <div className={`status-badge ${bug.severity}`}>{bug.severity}</div>
          </button>
        ))}
      </div>

      {snapshot.bugs
        .filter((bug) => bug.id === selectedBugId || (!selectedBugId && snapshot.bugs[0]?.id === bug.id))
        .map((bug) => (
          <article className="info-card" key={bug.id}>
            <h4>{bug.title}</h4>
            <p>{bug.details}</p>
            <div className="meta-grid">
              <span>Status: {bug.status}</span>
              <span>Discovered by: {bug.discoveredBy}</span>
              <span>Triaged by: {bug.triagedBy ?? 'Pending'}</span>
              <span>Assigned to: {bug.assignedTo ?? 'Pending'}</span>
            </div>
            <button className="primary" onClick={() => void onAdvance(bug)} disabled={bug.status === 'fixed'}>
              Advance Status
            </button>
          </article>
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
      <article className="info-card">
        <p className="eyebrow">Research board</p>
        <h4>References, captures, and product patterns</h4>
        <p>Research is stored as notes and evidence only. External code is not copied into the repo.</p>
      </article>

      <section className="card-grid">
        {snapshot.research.map((source) => (
          <article key={source.id} className="info-card">
            <div className="card-head">
              <span className="eyebrow">{source.kind}</span>
              <a href={source.url} target="_blank" rel="noreferrer">
                Open source
              </a>
            </div>
            <h4>{source.title}</h4>
            <p>{source.notes}</p>
            <ul className="plain-list">
              {source.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}
            </ul>
          </article>
        ))}
      </section>
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
      <article className="info-card">
        <p className="eyebrow">Run history</p>
        <h4>Each run captures the state of the agent team at that moment</h4>
        <p>Use this view to resume or pause a run and inspect its current blockers.</p>
      </article>

      <div className="list-card">
        {snapshot.runs.map((run) => (
          <button
            key={run.id}
            className={`run-row ${selectedRunId === run.id ? 'is-active' : ''}`}
            onClick={() => onSelectRun(run.id)}
          >
            <div>
              <strong>{run.title}</strong>
              <p>{run.phase}</p>
            </div>
            <div className={`status-badge ${run.status}`}>{run.status}</div>
          </button>
        ))}
      </div>

      {snapshot.runs
        .filter((run) => run.id === selectedRunId || (!selectedRunId && snapshot.runs[0]?.id === run.id))
        .map((run) => (
          <article className="info-card" key={run.id}>
            <h4>{run.title}</h4>
            <p>{run.summary}</p>
            <div className="meta-grid">
              <span>Started: {formatDate(run.startedAt)}</span>
              <span>Updated: {formatDate(run.updatedAt)}</span>
            </div>
            <div className="button-row">
              {run.status === 'running' ? (
                <button className="secondary" onClick={() => void onMutateRun(run, 'pause')}>
                  Pause Run
                </button>
              ) : null}
              {run.status === 'paused' ? (
                <button className="primary" onClick={() => void onMutateRun(run, 'resume')}>
                  Resume Run
                </button>
              ) : null}
            </div>
          </article>
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
      <article className="info-card">
        <p className="eyebrow">Codex runtime</p>
        <h4>{snapshot.project.codexRuntime.model} / {snapshot.project.codexRuntime.reasoningEffort}</h4>
        <ul className="plain-list">
          <li>Sandbox: {snapshot.project.codexRuntime.sandboxMode}</li>
          <li>Approval policy: {snapshot.project.codexRuntime.approvalPolicy}</li>
          <li>Web search: {snapshot.project.codexRuntime.enableSearch ? 'enabled' : 'disabled'}</li>
          <li>Minimum Codex version: {snapshot.project.codexRuntime.minimumVersion}</li>
        </ul>
      </article>

      <article className="info-card">
        <p className="eyebrow">Browser smoke check</p>
        <div className="inline-field">
          <input value={smokeUrl} onChange={(event) => onSmokeUrlChange(event.target.value)} />
          <button className="primary" onClick={onSmokeRun}>
            Run Playwright
          </button>
        </div>
      </article>
    </section>
  )
}

function OverviewStrip({
  snapshot,
  status,
  activeTab,
}: {
  snapshot: ProjectSnapshot | null
  status: SystemStatus | null
  activeTab: TabId
}) {
  const activeAgents = snapshot?.agents.filter((agent) => agent.status !== 'idle').length ?? 0
  const openBugs = snapshot?.bugs.filter((bug) => bug.status !== 'fixed').length ?? 0
  const currentRun = snapshot?.runs[0]

  return (
    <section className="overview-strip">
      <article className="overview-card">
        <span className="eyebrow">Current focus</span>
        <strong>{getTabTitle(activeTab)}</strong>
        <p>{getTabSummary(activeTab)}</p>
      </article>
      <article className="overview-card">
        <span className="eyebrow">Project</span>
        <strong>{snapshot?.project.name ?? 'No project attached'}</strong>
        <p>{snapshot ? snapshot.project.repoMode : 'Attach a folder to begin'}</p>
      </article>
      <article className="overview-card">
        <span className="eyebrow">Agents</span>
        <strong>{activeAgents}</strong>
        <p>{currentRun ? 'currently active in the latest run' : 'waiting for first run'}</p>
      </article>
      <article className="overview-card">
        <span className="eyebrow">Preflight</span>
        <strong>{status?.preflight.ok ? 'Ready' : 'Blocked'}</strong>
        <p>{openBugs > 0 ? `${openBugs} open bugs` : 'No open bugs in queue'}</p>
      </article>
    </section>
  )
}

function WorkflowStep({
  step,
  title,
  body,
  tone,
}: {
  step: string
  title: string
  body: string
  tone: 'ok' | 'warning' | 'neutral'
}) {
  return (
    <article className={`workflow-step ${tone}`}>
      <span className="workflow-index">{step}</span>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </article>
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
      <article className="inspector-card emphasis">
        <p className="eyebrow">What to do here</p>
        <h4>{getTabTitle(activeTab)}</h4>
        <p>{getTabSummary(activeTab)}</p>
      </article>

      <article className="inspector-card">
        <p className="eyebrow">Inspector</p>
        {activeTab === 'agents' && selectedAgent ? (
          <>
            <h4>{selectedAgent.name}</h4>
            <p>{selectedAgent.focus}</p>
            <ul className="plain-list">
              <li>Status: {selectedAgent.status}</li>
              <li>Queue: {selectedAgent.queue}</li>
              <li>Progress: {selectedAgent.progress}%</li>
              <li>PID: {selectedAgent.pid ?? 'inactive'}</li>
            </ul>
          </>
        ) : null}
        {activeTab === 'runs' && selectedRun ? (
          <>
            <h4>{selectedRun.title}</h4>
            <p>{selectedRun.summary}</p>
            <ul className="plain-list">
              {selectedRun.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              {selectedRun.blockers.length === 0 ? <li>No blockers recorded.</li> : null}
            </ul>
          </>
        ) : null}
        {activeTab === 'bugs' && selectedBug ? (
          <>
            <h4>{selectedBug.title}</h4>
            <p>{selectedBug.reproduction}</p>
            <ul className="plain-list">
              {selectedBug.evidencePaths.map((path) => <li key={path}>{path}</li>)}
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
            </ul>
          </>
        ) : null}
      </article>

      <article className="terminal-card compact">
        <div className="terminal-header">
          <span>Recent output</span>
          <small>Inspector tail</small>
        </div>
        <pre>{logs}</pre>
      </article>
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone,
  detail,
}: {
  label: string
  value: string
  tone: 'ok' | 'warning' | 'critical' | 'neutral'
  detail: string
}) {
  return (
    <article className="metric-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <div className={`status-dot ${tone}`}></div>
      <p>{detail}</p>
    </article>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <article className="info-card">
      <h4>{title}</h4>
      <p>{body}</p>
    </article>
  )
}

export default App
