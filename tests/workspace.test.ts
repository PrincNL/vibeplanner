import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildWorkspaceBootstrapPlan,
  WORKSPACE_DIRECTORIES,
} from '../src/test-support/workspace'

async function createTempProjectRoot() {
  return await mkdtemp(path.join(os.tmpdir(), 'vibeplanner-workspace-'))
}

async function applyWorkspaceBootstrapPlan(
  plan: ReturnType<typeof buildWorkspaceBootstrapPlan>,
) {
  for (const entry of plan.createdPaths) {
    await mkdir(entry, { recursive: true })
  }

  if (plan.initializeGit) {
    await mkdir(plan.gitRoot, { recursive: true })
  }
}

describe('workspace bootstrap', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('plans a git-initialized workspace for new projects', () => {
    const projectRoot = '/projects/acme-new'
    const plan = buildWorkspaceBootstrapPlan(projectRoot, 'new')

    expect(plan.projectRoot).toBe(projectRoot)
    expect(plan.workspaceRoot).toBe(path.join(projectRoot, 'vibeplanner'))
    expect(plan.gitRoot).toBe(path.join(projectRoot, '.git'))
    expect(plan.initializeGit).toBe(true)
    expect(plan.createdPaths).toHaveLength(WORKSPACE_DIRECTORIES.length + 1)
    expect(plan.createdPaths).toContain(path.join(projectRoot, 'vibeplanner', 'research-agent'))
  })

  it('plans a workspace without git initialization for existing repos', () => {
    const plan = buildWorkspaceBootstrapPlan('/projects/acme-existing', 'existing')

    expect(plan.initializeGit).toBe(false)
    expect(plan.createdPaths).not.toContain(path.join(plan.projectRoot, '.git'))
  })

  it('creates the workspace structure on disk for new projects', async () => {
    const projectRoot = await createTempProjectRoot()
    tempDirs.push(projectRoot)

    const plan = buildWorkspaceBootstrapPlan(projectRoot, 'new')
    await applyWorkspaceBootstrapPlan(plan)

    for (const entry of plan.createdPaths) {
      const entryStat = await stat(entry)
      expect(entryStat.isDirectory()).toBe(true)
    }

    const gitStat = await stat(plan.gitRoot)
    expect(gitStat.isDirectory()).toBe(true)
  })

  it('creates the workspace structure on disk for existing repos without touching git', async () => {
    const projectRoot = await createTempProjectRoot()
    tempDirs.push(projectRoot)

    const plan = buildWorkspaceBootstrapPlan(projectRoot, 'existing')
    await applyWorkspaceBootstrapPlan(plan)

    for (const entry of plan.createdPaths) {
      const entryStat = await stat(entry)
      expect(entryStat.isDirectory()).toBe(true)
    }

    await expect(stat(plan.gitRoot)).rejects.toBeTruthy()
  })
})
