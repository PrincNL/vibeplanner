import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildAgentPrompt } from '@shared/agents'
import type {
  AgentLogsInput,
  AgentMessage,
  AgentMessageInput,
  AgentRecord,
  AgentStatus,
  AgentRole,
  AgentStartInput,
  AgentStopInput,
  ProjectSnapshot,
} from '@shared/types'
import { ProjectService } from './project-service'
import { CodexService } from './codex-service'

interface ActiveSession {
  agentId: AgentRole
  projectRoot: string
  sessionId: string
  logFile: string
  child: ChildProcessWithoutNullStreams
  buffer: string[]
}

export class AgentOrchestrator {
  private sessions = new Map<string, ActiveSession>()

  constructor(
    private readonly projectService: ProjectService,
    private readonly codexService: CodexService,
  ) {}

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
    this.stopExistingSession(sessionKey)

    const sessionId = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const logFile = path.join(snapshot.project.workspacePath, targetAgent.folderName, `${sessionId}.log`)
    await mkdir(path.dirname(logFile), { recursive: true })

    const inbox = this.buildInbox(snapshot.messages, input.agentId)
    const prompt = buildAgentPrompt(
      snapshot.project,
      targetAgent,
      inbox,
      input.objectiveOverride,
      input.runId ?? null,
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
      sessionId,
      logFile,
      child,
      buffer: [],
    }
    this.sessions.set(sessionKey, session)

    const startedAgent: AgentRecord = {
      ...targetAgent,
      status: (input.agentId === 'strategy' ? 'planning' : 'working') satisfies AgentStatus,
      queue: targetAgent.queue + 1,
      progress: Math.min(95, Math.max(targetAgent.progress, 15)),
      focus: input.objectiveOverride ?? targetAgent.mission,
      lastUpdate: `Launched session ${sessionId} at ${startedAt}.`,
      pid: child.pid ?? null,
      sessionId,
    }

    await this.writeAgentState(snapshot, startedAgent)
    this.bindLogs(session, snapshot, startedAgent)
    return startedAgent
  }

  async stopAgent(input: AgentStopInput): Promise<void> {
    const sessionKey = this.buildSessionKey(input.projectRoot, input.agentId)
    const session = this.sessions.get(sessionKey)
    if (!session) {
      return
    }

    session.child.kill('SIGTERM')
    this.sessions.delete(sessionKey)

    const snapshot = await this.requireSnapshot(input.projectRoot)
    const agent = snapshot.agents.find((entry) => entry.id === input.agentId)
    if (agent) {
      const nextAgent: AgentRecord = {
        ...agent,
        status: 'idle',
        lastUpdate: 'Stopped by user.',
        pid: null,
        sessionId: null,
      }
      await this.writeAgentState(snapshot, nextAgent)
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

  stopRunAgents(projectRoot: string, agentIds: AgentRole[]) {
    for (const agentId of agentIds) {
      const sessionKey = this.buildSessionKey(projectRoot, agentId)
      this.stopExistingSession(sessionKey)
    }
  }

  private stopExistingSession(sessionKey: string) {
    const existing = this.sessions.get(sessionKey)
    if (existing) {
      existing.child.kill('SIGTERM')
      this.sessions.delete(sessionKey)
    }
  }

  private bindLogs(session: ActiveSession, snapshot: ProjectSnapshot, agent: AgentRecord) {
    const persistChunk = async (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      const text = chunk.toString()
      const line = `[${stream}] ${text}`
      session.buffer.push(line)
      if (session.buffer.length > 250) {
        session.buffer.shift()
      }
      await appendFile(session.logFile, line, 'utf8')
    }

    session.child.stdout.on('data', (chunk: Buffer) => void persistChunk(chunk, 'stdout'))
    session.child.stderr.on('data', (chunk: Buffer) => void persistChunk(chunk, 'stderr'))
    session.child.on('exit', async (code) => {
      this.sessions.delete(this.buildSessionKey(snapshot.project.rootPath, agent.id))
      const freshSnapshot = await this.requireSnapshot(snapshot.project.rootPath)
      const freshAgent = freshSnapshot.agents.find((entry) => entry.id === agent.id)
      if (!freshAgent) {
        return
      }

      const nextAgent: AgentRecord = {
        ...freshAgent,
        status: (code === 0 ? 'reviewing' : 'blocked') satisfies AgentStatus,
        progress: code === 0 ? 100 : Math.max(freshAgent.progress, 20),
        queue: Math.max(0, freshAgent.queue - 1),
        lastUpdate: code === 0 ? 'Session completed successfully.' : `Session exited with code ${code ?? -1}.`,
        pid: null,
        sessionId: session.sessionId,
      }
      await this.writeAgentState(freshSnapshot, nextAgent)
    })
  }

  private buildInbox(messages: AgentMessage[], agentId: AgentRole): string {
    return messages
      .filter((message) => message.to === agentId)
      .slice(-12)
      .map((message) => `[${message.createdAt}] ${message.from} -> ${message.to}: ${message.body}`)
      .join('\n')
  }

  private async writeAgentState(snapshot: ProjectSnapshot, nextAgent: AgentRecord) {
    const nextAgents = snapshot.agents.map((agent) => (agent.id === nextAgent.id ? nextAgent : agent))
    await this.projectService.saveAgents(snapshot.project.rootPath, nextAgents)
  }

  private async requireSnapshot(projectRoot: string): Promise<ProjectSnapshot> {
    const preflight = await this.codexService.runPreflight('0.117.0')
    return this.projectService.loadSnapshot(projectRoot, preflight)
  }

  private buildSessionKey(projectRoot: string, agentId: AgentRole) {
    return `${path.resolve(projectRoot)}::${agentId}`
  }
}
