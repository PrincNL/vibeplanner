import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildAgentPrompt } from '@shared/agents'
import type {
  AgentLogsInput,
  AgentMessage,
  AgentMessageInput,
  AgentRecord,
  AgentRole,
  AgentStartInput,
  AgentStatus,
  AgentStopInput,
  ProjectSnapshot,
  RunSession,
} from '@shared/types'
import { ProjectService } from './project-service'
import { CodexService } from './codex-service'

type SessionStopReason = 'replace' | 'pause' | 'user'

interface ActiveSession {
  agentId: AgentRole
  projectRoot: string
  runId: string | null
  sessionId: string
  logFile: string
  child: ChildProcessWithoutNullStreams
  buffer: string[]
  latestActivity: string
  lastChunkAt: string | null
  flushTimer: NodeJS.Timeout | null
  stopReason: SessionStopReason | null
}

export class AgentOrchestrator {
  private sessions = new Map<string, ActiveSession>()
  private writeQueues = new Map<string, Promise<unknown>>()

  constructor(
    private readonly projectService: ProjectService,
    private readonly codexService: CodexService,
  ) {}

  hasActiveSession(projectRoot: string, agentId: AgentRole): boolean {
    return this.sessions.has(this.buildSessionKey(projectRoot, agentId))
  }

  async startAgent(input: AgentStartInput): Promise<AgentRecord> {
    const snapshot = await this.requireSnapshot(input.projectRoot)
    if (!snapshot.preflight.ok) {
      throw new Error(snapshot.preflight.guidance[0] ?? 'Codex preflight failed.')
    }

    const targetAgent = snapshot.agents.find((agent) => agent.id === input.agentId)
    if (!targetAgent) {
      throw new Error(`Unknown agent ${input.agentId}`)
    }

    const sessionKey = this.buildSessionKey(input.projectRoot, input.agentId)
    this.stopExistingSession(sessionKey, 'replace')

    const sessionId = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const logFile = path.join(snapshot.project.workspacePath, targetAgent.folderName, `${sessionId}.log`)
    await mkdir(path.dirname(logFile), { recursive: true })

    const inbox = this.buildInbox(snapshot.messages, input.agentId)
    const resumeContext = await this.buildResumeContext(snapshot, targetAgent)
    const prompt = buildAgentPrompt(
      snapshot.project,
      targetAgent,
      inbox,
      input.objectiveOverride,
      input.runId ?? null,
      resumeContext,
    )
    const launchSpec = await this.codexService.getLaunchSpec(
      snapshot.project.rootPath,
      snapshot.project.codexRuntime,
      prompt,
    )
    const child = spawn(launchSpec.command, launchSpec.args, {
      cwd: snapshot.project.rootPath,
      env: launchSpec.env,
      stdio: 'pipe',
    })

    const session: ActiveSession = {
      agentId: input.agentId,
      projectRoot: snapshot.project.rootPath,
      runId: input.runId ?? null,
      sessionId,
      logFile,
      child,
      buffer: [],
      latestActivity: 'Codex session launched and waiting for output.',
      lastChunkAt: startedAt,
      flushTimer: null,
      stopReason: null,
    }
    this.sessions.set(sessionKey, session)

    const isResume =
      targetAgent.resumeCount > 0 ||
      Boolean(
        targetAgent.lastActivityAt &&
        !targetAgent.lastUpdate.startsWith('Queued for run') &&
        targetAgent.lastUpdate !== 'Awaiting assignment.',
      )

    const startedAgent: AgentRecord = {
      ...targetAgent,
      status: (input.agentId === 'strategy' ? 'planning' : 'working') satisfies AgentStatus,
      queue: Math.max(1, targetAgent.queue),
      progress: Math.min(95, Math.max(targetAgent.progress, 15)),
      focus: input.objectiveOverride ?? targetAgent.mission,
      lastUpdate: `Launched session ${sessionId} at ${startedAt}.`,
      activitySummary: 'Reading persisted checkpoints and preparing the next action.',
      lastActivityAt: startedAt,
      resumeCount: isResume ? targetAgent.resumeCount + 1 : targetAgent.resumeCount,
      pid: child.pid ?? null,
      sessionId,
    }

    await this.writeAgentState(snapshot.project.rootPath, startedAgent)
    await this.writeStatusCheckpoint(snapshot.project.rootPath, startedAgent)
    this.bindLogs(session)
    return startedAgent
  }

  async stopAgent(input: AgentStopInput): Promise<void> {
    const sessionKey = this.buildSessionKey(input.projectRoot, input.agentId)
    const session = this.sessions.get(sessionKey)
    if (!session) {
      return
    }

    session.stopReason = 'user'
    session.child.kill('SIGTERM')
    this.sessions.delete(sessionKey)

    const snapshot = await this.requireSnapshot(input.projectRoot)
    const agent = snapshot.agents.find((entry) => entry.id === input.agentId)
    if (agent) {
      const nextAgent: AgentRecord = {
        ...agent,
        status: 'idle',
        queue: 0,
        lastUpdate: 'Stopped by user.',
        activitySummary: 'Stopped manually from VibePlanner.',
        lastActivityAt: new Date().toISOString(),
        pid: null,
        sessionId: null,
      }
      await this.writeAgentState(snapshot.project.rootPath, nextAgent)
      await this.writeStatusCheckpoint(snapshot.project.rootPath, nextAgent)
    }
  }

  async sendMessage(input: AgentMessageInput): Promise<AgentMessage> {
    const snapshot = await this.requireSnapshot(input.projectRoot)
    const message: AgentMessage = {
      ...input.message,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    const messages = [...snapshot.messages, message]
    await this.projectService.saveMessages(input.projectRoot, messages)
    return message
  }

  async getLogs(input: AgentLogsInput): Promise<string> {
    const sessionKey = this.buildSessionKey(input.projectRoot, input.agentId)
    const session = this.sessions.get(sessionKey)
    if (session) {
      return session.buffer.join('')
    }

    const snapshot = await this.requireSnapshot(input.projectRoot)
    const agent = snapshot.agents.find((entry) => entry.id === input.agentId)
    if (!agent?.sessionId) {
      return 'No logs recorded for this agent yet.'
    }

    const logFile = path.join(snapshot.project.workspacePath, agent.folderName, `${agent.sessionId}.log`)
    try {
      return await readFile(logFile, 'utf8')
    } catch {
      return 'No logs recorded for this agent yet.'
    }
  }

  stopRunAgents(projectRoot: string, agentIds: AgentRole[], reason: SessionStopReason = 'pause') {
    for (const agentId of agentIds) {
      const sessionKey = this.buildSessionKey(projectRoot, agentId)
      this.stopExistingSession(sessionKey, reason)
    }
  }

  private stopExistingSession(sessionKey: string, reason: SessionStopReason) {
    const existing = this.sessions.get(sessionKey)
    if (existing) {
      existing.stopReason = reason
      if (existing.flushTimer) {
        clearTimeout(existing.flushTimer)
        existing.flushTimer = null
      }
      existing.child.kill('SIGTERM')
      this.sessions.delete(sessionKey)
    }
  }

  private bindLogs(session: ActiveSession) {
    const persistChunk = async (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      const text = chunk.toString()
      const line = `[${stream}] ${text}`
      session.buffer.push(line)
      if (session.buffer.length > 250) {
        session.buffer.shift()
      }
      await appendFile(session.logFile, line, 'utf8')

      const summary = summarizeChunk(text)
      if (summary) {
        session.latestActivity = `${stream}: ${summary}`
        session.lastChunkAt = new Date().toISOString()
        this.scheduleActivityFlush(session)
      }
    }

    session.child.stdout.on('data', (chunk: Buffer) => void persistChunk(chunk, 'stdout'))
    session.child.stderr.on('data', (chunk: Buffer) => void persistChunk(chunk, 'stderr'))
    session.child.on('exit', async (code) => {
      if (session.flushTimer) {
        clearTimeout(session.flushTimer)
        session.flushTimer = null
      }

      this.sessions.delete(this.buildSessionKey(session.projectRoot, session.agentId))

      if (session.stopReason) {
        return
      }

      await this.flushActivity(session)
      const freshSnapshot = await this.requireSnapshot(session.projectRoot)
      const freshAgent = freshSnapshot.agents.find((entry) => entry.id === session.agentId)
      if (!freshAgent) {
        return
      }

      const finishedAt = new Date().toISOString()
      const success = code === 0
      const nextAgent: AgentRecord = {
        ...freshAgent,
        status: (success ? 'reviewing' : 'blocked') satisfies AgentStatus,
        progress: success ? 100 : Math.max(freshAgent.progress, 20),
        queue: Math.max(0, freshAgent.queue - 1),
        lastUpdate: success ? 'Session completed successfully.' : `Session exited with code ${code ?? -1}.`,
        activitySummary: success
          ? 'Completed the current assignment and handed off for review.'
          : session.latestActivity || `Exited with code ${code ?? -1}.`,
        lastActivityAt: session.lastChunkAt ?? finishedAt,
        pid: null,
        sessionId: session.sessionId,
      }
      await this.writeAgentState(session.projectRoot, nextAgent)
      await this.writeStatusCheckpoint(session.projectRoot, nextAgent)
      if (session.runId) {
        await this.updateRunHeartbeat(
          session.projectRoot,
          session.runId,
          nextAgent.name,
          nextAgent.activitySummary,
          nextAgent.lastActivityAt,
        )
      }
    })
  }

  private scheduleActivityFlush(session: ActiveSession) {
    if (session.flushTimer) {
      return
    }

    session.flushTimer = setTimeout(() => {
      session.flushTimer = null
      void this.flushActivity(session)
    }, 900)
  }

  private async flushActivity(session: ActiveSession) {
    if (!session.latestActivity) {
      return
    }

    const activityAt = session.lastChunkAt ?? new Date().toISOString()
    await this.queueStateWrite(session.projectRoot, async () => {
      const snapshot = await this.requireSnapshot(session.projectRoot)
      const freshAgent = snapshot.agents.find((entry) => entry.id === session.agentId)
      if (!freshAgent) {
        return
      }

      const nextAgent: AgentRecord = {
        ...freshAgent,
        status:
          freshAgent.status === 'idle'
            ? (session.agentId === 'strategy' ? 'planning' : 'working')
            : freshAgent.status,
        queue: Math.max(freshAgent.queue, 1),
        progress: bumpProgress(freshAgent.progress),
        lastUpdate: session.latestActivity,
        activitySummary: session.latestActivity,
        lastActivityAt: activityAt,
        pid: session.child.pid ?? freshAgent.pid,
        sessionId: session.sessionId,
      }

      await this.projectService.saveAgents(session.projectRoot, snapshot.agents.map((agent) => (
        agent.id === nextAgent.id ? nextAgent : agent
      )))
      await this.writeStatusCheckpoint(session.projectRoot, nextAgent)

      if (session.runId) {
        await this.projectService.saveRuns(
          session.projectRoot,
          snapshot.runs.map((run) => (
            run.id === session.runId
              ? {
                  ...run,
                  updatedAt: activityAt,
                  lastAgentActivityAt: activityAt,
                  summary: `${nextAgent.name}: ${session.latestActivity}`,
                }
              : run
          )),
        )
      }
    })
  }

  private buildInbox(messages: AgentMessage[], agentId: AgentRole): string {
    return messages
      .filter((message) => message.to === agentId)
      .slice(-12)
      .map((message) => `[${message.createdAt}] ${message.from} -> ${message.to}: ${message.body}`)
      .join('\n')
  }

  private async buildResumeContext(snapshot: ProjectSnapshot, agent: AgentRecord): Promise<string> {
    const agentRoot = path.join(snapshot.project.workspacePath, agent.folderName)
    const [status, notes, decisions] = await Promise.all([
      this.safeReadText(path.join(agentRoot, 'status.md')),
      this.safeReadText(path.join(agentRoot, 'notes.md')),
      this.safeReadText(path.join(agentRoot, 'decisions.md')),
    ])

    const latestRun = snapshot.runs[0]
    const sections = [
      status ? `Saved status.md\n${trimForPrompt(status, 1800)}` : null,
      notes ? `Saved notes.md\n${trimForPrompt(notes, 1400)}` : null,
      decisions ? `Saved decisions.md\n${trimForPrompt(decisions, 1400)}` : null,
      latestRun
        ? `Latest run\n- Title: ${latestRun.title}\n- Status: ${latestRun.status}\n- Summary: ${latestRun.summary}`
        : null,
      agent.lastActivityAt
        ? `Last persisted activity\n- At: ${agent.lastActivityAt}\n- Summary: ${agent.activitySummary}`
        : null,
    ].filter(Boolean)

    return sections.join('\n\n')
  }

  private async writeStatusCheckpoint(projectRoot: string, agent: AgentRecord) {
    const filePath = path.join(projectRoot, 'vibeplanner', agent.folderName, 'status.md')
    const contents = [
      `# ${agent.name} status`,
      '',
      '## Status',
      `${agent.status}`,
      '',
      '## Current focus',
      `${agent.focus}`,
      '',
      '## Progress',
      `${agent.progress}%`,
      '',
      '## Activity summary',
      `${agent.activitySummary}`,
      '',
      '## Last update',
      `${agent.lastUpdate}`,
      '',
      '## Last activity at',
      `${agent.lastActivityAt ?? 'No activity recorded yet.'}`,
      '',
      '## Session',
      `- Resume count: ${agent.resumeCount}`,
      `- PID: ${agent.pid ?? 'inactive'}`,
      `- Session ID: ${agent.sessionId ?? 'none'}`,
      '',
      '## Next actions',
      '- Continue from the saved checkpoint instead of restarting work.',
      '- Read notes.md and decisions.md before changing direction.',
      '- Persist new blockers, evidence, and handoffs as they happen.',
      '',
    ].join('\n')

    await writeFile(filePath, contents, 'utf8')
  }

  private async updateRunHeartbeat(
    projectRoot: string,
    runId: string,
    agentName: string,
    summary: string,
    activityAt: string | null,
  ) {
    await this.queueStateWrite(projectRoot, async () => {
      const snapshot = await this.requireSnapshot(projectRoot)
      const nextRuns: RunSession[] = snapshot.runs.map((run) => (
        run.id === runId
          ? {
              ...run,
              updatedAt: activityAt ?? new Date().toISOString(),
              lastAgentActivityAt: activityAt ?? run.lastAgentActivityAt,
              summary: `${agentName}: ${summary}`,
              status: deriveRunStatus(
                run.status,
                snapshot.agents.filter((agent) => run.agentIds.includes(agent.id)),
                (agentId) => this.hasActiveSession(projectRoot, agentId),
              ),
              blockers: snapshot.agents
                .filter((agent) => run.agentIds.includes(agent.id) && agent.status === 'blocked')
                .map((agent) => `${agent.name}: ${agent.lastUpdate}`),
            }
          : run
      ))
      await this.projectService.saveRuns(projectRoot, nextRuns)
    })
  }

  private async writeAgentState(projectRoot: string, nextAgent: AgentRecord) {
    await this.queueStateWrite(projectRoot, async () => {
      const snapshot = await this.requireSnapshot(projectRoot)
      await this.projectService.saveAgents(
        projectRoot,
        snapshot.agents.map((agent) => (agent.id === nextAgent.id ? nextAgent : agent)),
      )
    })
  }

  private queueStateWrite<T>(projectRoot: string, operation: () => Promise<T>): Promise<T> {
    const queueKey = path.resolve(projectRoot)
    const previous = this.writeQueues.get(queueKey) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(operation)
    this.writeQueues.set(queueKey, next.catch(() => undefined))
    return next
  }

  private async safeReadText(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf8')
    } catch {
      return ''
    }
  }

  private async requireSnapshot(projectRoot: string): Promise<ProjectSnapshot> {
    const preflight = await this.codexService.runPreflight('0.117.0')
    return this.projectService.loadSnapshot(projectRoot, preflight)
  }

  private buildSessionKey(projectRoot: string, agentId: AgentRole) {
    return `${path.resolve(projectRoot)}::${agentId}`
  }
}

function summarizeChunk(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)
    ?.slice(0, 220) ?? ''
}

function bumpProgress(progress: number): number {
  return Math.min(92, progress + (progress < 30 ? 7 : progress < 60 ? 5 : 3))
}

function trimForPrompt(value: string, limit: number): string {
  const normalized = value.trim()
  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit)}\n...[truncated]`
}

function deriveRunStatus(
  currentStatus: RunSession['status'],
  agents: AgentRecord[],
  isActiveSession: (agentId: AgentRole) => boolean,
): RunSession['status'] {
  if (currentStatus === 'paused') {
    return 'paused'
  }

  const hasActive = agents.some((agent) => isActiveSession(agent.id))
  if (!hasActive && agents.some((agent) => agent.status === 'blocked')) {
    return 'failed'
  }

  if (!hasActive && agents.every((agent) => agent.status === 'reviewing' || agent.status === 'idle')) {
    return 'completed'
  }

  return 'running'
}
