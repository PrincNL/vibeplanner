import type { ProjectSnapshot, SystemStatus } from '@shared/types'

export type TabId =
  | 'onboarding'
  | 'project'
  | 'dashboard'
  | 'agents'
  | 'bugs'
  | 'research'
  | 'runs'
  | 'settings'

export interface TabDefinition {
  id: TabId
  label: string
  hint: string
}

export interface AppSeed {
  status: SystemStatus
  snapshot: ProjectSnapshot
}
