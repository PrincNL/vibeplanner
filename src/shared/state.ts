export type BugStatus = 'submitted' | 'open' | 'fixing' | 'fixed'
export type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed'

const BUG_TRANSITIONS: Record<BugStatus, readonly BugStatus[]> = {
  submitted: ['open'],
  open: ['fixing'],
  fixing: ['fixed'],
  fixed: [],
}

const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ['running'],
  running: ['paused', 'completed', 'failed'],
  paused: ['running', 'completed', 'failed'],
  completed: [],
  failed: [],
}

export function transitionBugStatus(current: BugStatus, next: BugStatus): BugStatus {
  if (!BUG_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid bug transition: ${current} -> ${next}`)
  }

  return next
}

export function transitionRunStatus(current: RunStatus, next: RunStatus): RunStatus {
  if (!RUN_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid run transition: ${current} -> ${next}`)
  }

  return next
}
