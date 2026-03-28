import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  evaluateCodexPreflight,
  parseCodexLoginStatus,
  parseCodexVersion,
} from '../src/test-support/codex-preflight'

describe('codex preflight', () => {
  it('parses the logged-in status emitted by codex', () => {
    expect(parseCodexLoginStatus('Logged in using ChatGPT')).toBe('logged-in')
    expect(parseCodexLoginStatus('Logged out')).toBe('logged-out')
    expect(parseCodexLoginStatus('status unavailable')).toBe('unknown')
  })

  it('parses the codex version string', () => {
    expect(parseCodexVersion('codex-cli 0.117.0')).toBe('0.117.0')
    expect(parseCodexVersion('unexpected output')).toBeNull()
  })

  it('compares semantic versions correctly', () => {
    expect(compareVersions('0.117.0', '0.117.0')).toBe(0)
    expect(compareVersions('0.118.0', '0.117.0')).toBe(1)
    expect(compareVersions('0.116.9', '0.117.0')).toBe(-1)
  })

  it('blocks when codex is missing', () => {
    const result = evaluateCodexPreflight({
      codexFound: false,
      loginStatusOutput: 'Logged in using ChatGPT',
      versionOutput: 'codex-cli 0.117.0',
    })

    expect(result.ok).toBe(false)
    expect(result.issues[0]).toContain('not installed')
    expect(result.guidance[0]).toContain('Install or update Codex CLI')
  })

  it('blocks when codex is logged out', () => {
    const result = evaluateCodexPreflight({
      codexFound: true,
      loginStatusOutput: 'Logged out',
      versionOutput: 'codex-cli 0.117.0',
    })

    expect(result.ok).toBe(false)
    expect(result.loginState).toBe('logged-out')
    expect(result.issues).toContain('Codex CLI is not logged in with a ChatGPT account.')
  })

  it('blocks when the installed version is too old', () => {
    const result = evaluateCodexPreflight(
      {
        codexFound: true,
        loginStatusOutput: 'Logged in using ChatGPT',
        versionOutput: 'codex-cli 0.116.0',
      },
      '0.117.0',
    )

    expect(result.ok).toBe(false)
    expect(result.detectedVersion).toBe('0.116.0')
    expect(result.issues.some((issue) => issue.includes('older than the supported minimum'))).toBe(
      true,
    )
  })

  it('passes when the environment is ready', () => {
    const result = evaluateCodexPreflight({
      codexFound: true,
      loginStatusOutput: 'Logged in using ChatGPT',
      versionOutput: 'codex-cli 0.117.0',
    })

    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.guidance).toHaveLength(0)
  })
})
