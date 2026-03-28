import { dialog, shell, type IpcMain } from 'electron'
import type { VibePlannerApi } from '@shared/types'
import { ProjectService } from './services/project-service'
import { CodexService } from './services/codex-service'
import { AgentOrchestrator } from './services/agent-orchestrator'
import { RunService } from './services/run-service'

export function registerIpcHandlers(
  ipcMain: IpcMain,
  services: {
    projectService: ProjectService
    codexService: CodexService
    orchestrator: AgentOrchestrator
    runService: RunService
  },
) {
  const api: VibePlannerApi = {
    system: {
      preflight: async () =>
        services.codexService.getSystemStatus({
          model: 'gpt-5.4',
          reasoningEffort: 'high',
          minimumVersion: '0.117.0',
          approvalPolicy: 'never',
          sandboxMode: 'workspace-write',
          enableSearch: true,
        }),
    },
    project: {
      create: async (input) => {
        const project = await services.projectService.createProject(input)
        const preflight = await services.codexService.runPreflight(project.codexRuntime.minimumVersion)
        return services.projectService.loadSnapshot(project.rootPath, preflight)
      },
      attach: async (input) => {
        const project = await services.projectService.attachProject(input)
        const preflight = await services.codexService.runPreflight(project.codexRuntime.minimumVersion)
        return services.projectService.loadSnapshot(project.rootPath, preflight)
      },
      load: async (projectRoot) => {
        const preflight = await services.codexService.runPreflight('0.117.0')
        return services.projectService.loadSnapshot(projectRoot, preflight)
      },
      pickDirectory: async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
        })
        return result.canceled ? null : result.filePaths[0] ?? null
      },
      pickBrief: async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        })
        return result.canceled ? null : result.filePaths[0] ?? null
      },
    },
    agent: {
      start: (input) => services.orchestrator.startAgent(input),
      stop: (input) => services.orchestrator.stopAgent(input),
      sendMessage: (input) => services.orchestrator.sendMessage(input),
      getLogs: (input) => services.orchestrator.getLogs(input),
    },
    run: {
      start: (input) => services.runService.startRun(input),
      pause: (input) => services.runService.pauseRun(input),
      resume: (input) => services.runService.resumeRun(input),
      recover: (projectRoot) => services.runService.recoverRun(projectRoot),
      list: (projectRoot) => services.runService.listRuns(projectRoot),
    },
    bug: {
      create: (input) => services.runService.createBug(input),
      update: (input) => services.runService.updateBug(input),
      list: (projectRoot) => services.runService.listBugs(projectRoot),
    },
    artifact: {
      open: async (absolutePath) => {
        await shell.openPath(absolutePath)
      },
    },
    browser: {
      openExternal: async (target) => {
        await shell.openExternal(target)
      },
    },
    testing: {
      run: (input) => services.runService.runTesting(input),
    },
  }

  ipcMain.handle('system.preflight', () => api.system.preflight())
  ipcMain.handle('project.create', (_, input) => api.project.create(input))
  ipcMain.handle('project.attach', (_, input) => api.project.attach(input))
  ipcMain.handle('project.load', (_, projectRoot) => api.project.load(projectRoot))
  ipcMain.handle('project.pickDirectory', () => api.project.pickDirectory())
  ipcMain.handle('project.pickBrief', () => api.project.pickBrief())
  ipcMain.handle('agent.start', (_, input) => api.agent.start(input))
  ipcMain.handle('agent.stop', (_, input) => api.agent.stop(input))
  ipcMain.handle('agent.sendMessage', (_, input) => api.agent.sendMessage(input))
  ipcMain.handle('agent.getLogs', (_, input) => api.agent.getLogs(input))
  ipcMain.handle('run.start', (_, input) => api.run.start(input))
  ipcMain.handle('run.pause', (_, input) => api.run.pause(input))
  ipcMain.handle('run.resume', (_, input) => api.run.resume(input))
  ipcMain.handle('run.recover', (_, projectRoot) => api.run.recover(projectRoot))
  ipcMain.handle('run.list', (_, projectRoot) => api.run.list(projectRoot))
  ipcMain.handle('bug.create', (_, input) => api.bug.create(input))
  ipcMain.handle('bug.update', (_, input) => api.bug.update(input))
  ipcMain.handle('bug.list', (_, projectRoot) => api.bug.list(projectRoot))
  ipcMain.handle('artifact.open', (_, absolutePath) => api.artifact.open(absolutePath))
  ipcMain.handle('browser.openExternal', (_, target) => api.browser.openExternal(target))
  ipcMain.handle('testing.run', (_, input) => api.testing.run(input))
}
