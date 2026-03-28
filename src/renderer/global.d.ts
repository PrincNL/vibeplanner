import type { VibePlannerApi } from '@shared/types'

declare global {
  interface Window {
    vibeplanner?: VibePlannerApi
  }
}

export {}
