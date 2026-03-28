import { describe, expect, it } from 'vitest'
import {
  transitionBugStatus,
  transitionRunStatus,
  type BugStatus,
  type RunStatus,
} from '../src/test-support/state'

describe('state transitions', () => {
  it('advances bugs through the approved lifecycle', () => {
    let status: BugStatus = 'submitted'
    status = transitionBugStatus(status, 'open')
    status = transitionBugStatus(status, 'fixing')
    status = transitionBugStatus(status, 'fixed')

    expect(status).toBe('fixed')
  })

  it('rejects invalid bug jumps', () => {
    expect(() => transitionBugStatus('submitted', 'fixed')).toThrow(
      'Invalid bug transition: submitted -> fixed',
    )
  })

  it('advances runs through a simple execution lifecycle', () => {
    let status: RunStatus = 'queued'
    status = transitionRunStatus(status, 'running')
    status = transitionRunStatus(status, 'paused')
    status = transitionRunStatus(status, 'running')
    status = transitionRunStatus(status, 'completed')

    expect(status).toBe('completed')
  })

  it('rejects invalid run transitions', () => {
    expect(() => transitionRunStatus('completed', 'running')).toThrow(
      'Invalid run transition: completed -> running',
    )
  })
})
