import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import { registerIpcHandlers } from './ipc'
import { ProjectService } from './services/project-service'
import { CodexService } from './services/codex-service'
import { AgentOrchestrator } from './services/agent-orchestrator'
import { RunService } from './services/run-service'

const isDev = !app.isPackaged
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
  const window = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#071117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

const projectService = new ProjectService()
const codexService = new CodexService()
const orchestrator = new AgentOrchestrator(projectService, codexService)
const runService = new RunService(projectService, codexService, orchestrator)

app.whenReady().then(() => {
  registerIpcHandlers(ipcMain, {
    projectService,
    codexService,
    orchestrator,
    runService,
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

if (isDev) {
  app.commandLine.appendSwitch('enable-logging')
}
