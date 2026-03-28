import { contextBridge, ipcRenderer } from 'electron'
import type { VibePlannerApi } from '@shared/types'

const api: VibePlannerApi = {
  system: {
    preflight: () => ipcRenderer.invoke('system.preflight'),
  },
  project: {
    create: (input) => ipcRenderer.invoke('project.create', input),
    attach: (input) => ipcRenderer.invoke('project.attach', input),
    load: (projectRoot) => ipcRenderer.invoke('project.load', projectRoot),
    pickDirectory: () => ipcRenderer.invoke('project.pickDirectory'),
    pickBrief: () => ipcRenderer.invoke('project.pickBrief'),
  },
  agent: {
    start: (input) => ipcRenderer.invoke('agent.start', input),
    stop: (input) => ipcRenderer.invoke('agent.stop', input),
    sendMessage: (input) => ipcRenderer.invoke('agent.sendMessage', input),
    getLogs: (input) => ipcRenderer.invoke('agent.getLogs', input),
  },
  run: {
    start: (input) => ipcRenderer.invoke('run.start', input),
    pause: (input) => ipcRenderer.invoke('run.pause', input),
    resume: (input) => ipcRenderer.invoke('run.resume', input),
    list: (projectRoot) => ipcRenderer.invoke('run.list', projectRoot),
  },
  bug: {
    create: (input) => ipcRenderer.invoke('bug.create', input),
    update: (input) => ipcRenderer.invoke('bug.update', input),
    list: (projectRoot) => ipcRenderer.invoke('bug.list', projectRoot),
  },
  artifact: {
    open: (absolutePath) => ipcRenderer.invoke('artifact.open', absolutePath),
  },
  browser: {
    openExternal: (target) => ipcRenderer.invoke('browser.openExternal', target),
  },
  testing: {
    run: (input) => ipcRenderer.invoke('testing.run', input),
  },
}

contextBridge.exposeInMainWorld('vibeplanner', api)
