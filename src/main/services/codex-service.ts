import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { evaluateCodexPreflight, type CodexPreflightResult } from '@shared/codex'
import type { CodexRuntimeProfile, SystemStatus } from '@shared/types'

const execFileAsync = promisify(execFile)

interface ExecResult {
  ok: boolean
  stdout: string
  stderr: string
  output: string
}

interface CodexResolution {
  command: string | null
  env: NodeJS.ProcessEnv
  path: string | null
  source: 'process-env' | 'common-path' | 'login-shell' | 'missing'
  shellPath: string
}

export class CodexService {
  async getSystemStatus(runtime: CodexRuntimeProfile): Promise<SystemStatus> {
    const resolution = await this.resolveCodexResolution()
    const [version, loginStatus] = resolution.command
      ? await Promise.all([
          this.safeExec(resolution.command, ['--version'], resolution.env),
          this.safeExec(resolution.command, ['login', 'status'], resolution.env),
        ])
      : [
          { ok: false, stdout: '', stderr: '', output: '' },
          { ok: false, stdout: '', stderr: '', output: '' },
        ]
    const preflight = evaluateCodexPreflight(
      {
        codexFound: Boolean(resolution.command),
        versionOutput: version.output,
        loginStatusOutput: loginStatus.output,
      },
      runtime.minimumVersion,
    )

    return {
      preflight,
      codexPath: resolution.path,
      codexPathSource: resolution.source,
      loginStatusOutput: loginStatus.output,
      versionOutput: version.output,
      shellPath: resolution.shellPath,
      browserReady: true,
      platform: process.platform,
    }
  }

  async runPreflight(minimumVersion: string): Promise<CodexPreflightResult> {
    const resolution = await this.resolveCodexResolution()
    const [version, loginStatus] = resolution.command
      ? await Promise.all([
          this.safeExec(resolution.command, ['--version'], resolution.env),
          this.safeExec(resolution.command, ['login', 'status'], resolution.env),
        ])
      : [
          { ok: false, stdout: '', stderr: '', output: '' },
          { ok: false, stdout: '', stderr: '', output: '' },
        ]

    return evaluateCodexPreflight(
      {
        codexFound: Boolean(resolution.command),
        versionOutput: version.output,
        loginStatusOutput: loginStatus.output,
      },
      minimumVersion,
    )
  }

  async getLaunchSpec(projectRoot: string, runtime: CodexRuntimeProfile, prompt: string) {
    const resolution = await this.resolveCodexResolution()
    if (!resolution.command) {
      throw new Error('Codex CLI could not be resolved from the Electron environment.')
    }

    return {
      command: resolution.command,
      env: resolution.env,
      args: this.buildExecArgs(projectRoot, runtime, prompt),
    }
  }

  buildExecArgs(projectRoot: string, runtime: CodexRuntimeProfile, prompt: string): string[] {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '-C',
      path.resolve(projectRoot),
      '-a',
      runtime.approvalPolicy,
      '-s',
      runtime.sandboxMode,
      '-m',
      runtime.model,
      '-c',
      `model_reasoning_effort="${runtime.reasoningEffort}"`,
    ]

    if (runtime.enableSearch) {
      args.push('--search')
    }

    args.push(prompt)
    return args
  }

  private async resolveCodexResolution(): Promise<CodexResolution> {
    const shellPath = process.env.SHELL || '/bin/zsh'
    const envPath = await this.detectFromProcessEnv()
    if (envPath) {
      return {
        command: envPath,
        env: process.env,
        path: envPath,
        source: 'process-env',
        shellPath,
      }
    }

    const commonPath = await this.detectFromCommonPaths()
    if (commonPath) {
      return {
        command: commonPath,
        env: {
          ...process.env,
          PATH: this.appendDirectoryToPath(process.env.PATH, path.dirname(commonPath)),
        },
        path: commonPath,
        source: 'common-path',
        shellPath,
      }
    }

    const loginShell = await this.detectFromLoginShell(shellPath)
    if (loginShell.path) {
      return {
        command: loginShell.path,
        env: {
          ...process.env,
          PATH: loginShell.pathValue || process.env.PATH,
        },
        path: loginShell.path,
        source: 'login-shell',
        shellPath,
      }
    }

    return {
      command: null,
      env: process.env,
      path: null,
      source: 'missing',
      shellPath,
    }
  }

  private async detectFromProcessEnv(): Promise<string | null> {
    const probe = process.platform === 'win32'
      ? await this.safeExec('where', ['codex'], process.env)
      : await this.safeExec('which', ['codex'], process.env)

    const firstLine = probe.stdout.split('\n').map((line) => line.trim()).find(Boolean)
    return probe.ok ? firstLine ?? null : null
  }

  private async detectFromCommonPaths(): Promise<string | null> {
    const home = os.homedir()
    const candidates = process.platform === 'win32'
      ? [
          path.join(home, 'AppData', 'Roaming', 'npm', 'codex.cmd'),
          path.join(home, 'AppData', 'Roaming', 'npm', 'codex'),
        ]
      : [
          path.join(home, '.npm-global', 'bin', 'codex'),
          path.join(home, '.local', 'bin', 'codex'),
          '/opt/homebrew/bin/codex',
          '/usr/local/bin/codex',
        ]

    for (const candidate of candidates) {
      try {
        await access(candidate)
        return candidate
      } catch {
        continue
      }
    }

    return null
  }

  private async detectFromLoginShell(shellPath: string): Promise<{ path: string | null; pathValue: string | null }> {
    const probe = await this.safeExec(
      shellPath,
      ['-lc', 'command -v codex || true; printf "\\n__VIBEPLANNER_PATH__\\n%s" "$PATH"'],
      process.env,
    )
    const [rawPath, rawPathValue] = probe.stdout.split('\n__VIBEPLANNER_PATH__\n')
    const resolvedPath = rawPath
      ?.split('\n')
      .map((line) => line.trim())
      .find(Boolean)

    return {
      path: resolvedPath ?? null,
      pathValue: rawPathValue?.trim() || null,
    }
  }

  private appendDirectoryToPath(currentPath: string | undefined, directory: string) {
    if (!currentPath) {
      return directory
    }

    const segments = currentPath.split(path.delimiter)
    return segments.includes(directory) ? currentPath : `${directory}${path.delimiter}${currentPath}`
  }

  private async safeExec(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<ExecResult> {
    try {
      const result = await execFileAsync(command, args, { timeout: 15000, env })
      const stdout = result.stdout.toString()
      const stderr = result.stderr.toString()
      return {
        ok: true,
        stdout,
        stderr,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
      }
    } catch (error) {
      const stdout = error instanceof Error && 'stdout' in error ? String(error.stdout ?? '') : ''
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr ?? '') : ''
      return {
        ok: false,
        stdout,
        stderr,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
      }
    }
  }
}
