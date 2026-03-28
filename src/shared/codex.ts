export type CodexLoginState = 'logged-in' | 'logged-out' | 'unknown'

export interface CodexPreflightProbe {
  codexFound: boolean
  loginStatusOutput: string
  versionOutput: string
}

export interface CodexPreflightResult {
  ok: boolean
  detectedVersion: string | null
  loginState: CodexLoginState
  issues: string[]
  guidance: string[]
}

export function parseCodexLoginStatus(output: string): CodexLoginState {
  const normalized = output.trim().toLowerCase()

  if (normalized.includes('logged in')) {
    return 'logged-in'
  }

  if (normalized.includes('logged out') || normalized.includes('not logged in')) {
    return 'logged-out'
  }

  return 'unknown'
}

export function parseCodexVersion(output: string): string | null {
  const match = output.trim().match(/codex-cli\s+([0-9]+\.[0-9]+\.[0-9]+)/i)
  return match?.[1] ?? null
}

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)

  for (let index = 0; index < 3; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0

    if (leftValue > rightValue) {
      return 1
    }

    if (leftValue < rightValue) {
      return -1
    }
  }

  return 0
}

export function evaluateCodexPreflight(
  probe: CodexPreflightProbe,
  minimumVersion = '0.117.0',
): CodexPreflightResult {
  const issues: string[] = []
  const guidance: string[] = []

  if (!probe.codexFound) {
    issues.push('Codex CLI is not installed or not on PATH.')
    guidance.push('Install or update Codex CLI, then restart VibePlanner.')
  }

  const loginState = parseCodexLoginStatus(probe.loginStatusOutput)
  if (loginState !== 'logged-in') {
    issues.push('Codex CLI is not logged in with a ChatGPT account.')
    guidance.push('Run `codex login` and complete ChatGPT authentication.')
  }

  const detectedVersion = parseCodexVersion(probe.versionOutput)
  if (!detectedVersion) {
    issues.push('Codex CLI version could not be detected.')
    guidance.push('Run `codex --version` and update the CLI if needed.')
  } else if (compareVersions(detectedVersion, minimumVersion) < 0) {
    issues.push(`Codex CLI ${detectedVersion} is older than the supported minimum ${minimumVersion}.`)
    guidance.push('Update Codex CLI to the supported version before starting a run.')
  }

  return {
    ok: issues.length === 0,
    detectedVersion,
    loginState,
    issues,
    guidance,
  }
}
