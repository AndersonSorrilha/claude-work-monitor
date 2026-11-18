export type Turn = { isWorking: boolean; startedAt: number; endedAt: number }

export type PlanItem = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type FileChange = {
  path: string
  added: number
  removed: number
}

export type TestRun = { command: string; isPassing: boolean; summary: string }

declare module 'claude-code' {
  interface PluginState {
    'work-monitor': {
      turn: Shaped<Turn>
      plan: Shaped<PlanItem[]>
      changes: Shaped<FileChange[]>
      files: Shaped<string[]>
      tests: Shaped<TestRun[]>
      open: Shaped<Record<string, boolean>>
      now: number
    }
  }
}
