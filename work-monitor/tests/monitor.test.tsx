import type { AgentInfo } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'work-monitor',
  component: 'Pane',
  requestId: 'work-monitor',
  props: {
    title: 'Monitor',
    isFocused: false,
    bodyColumns: 44,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the pane follows a turn, on every surface', async ($, on) => {
  // Each hook here stands for the engine beneath the mod.
  const clock = mock.clock(on, { now: 1_000 })
  on('command.register', () => ({ value: { command: 'monitor' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.cwd', () => ({ value: '/work/the-edge' }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 24_000, window: 200_000, percent: 12 },
      rateLimits: [],
    },
  }))
  on('agent.list', () => ({ value: [] }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', (_, e) =>
    e.tool === 'Bash'
      ? { result: {}, text: 'Tests: 12 passing' }
      : { result: {} },
  )

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'build', turnId: 't1' })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'World engine', status: 'in_progress', activeForm: 'Building' },
      { content: 'Terrain', status: 'pending', activeForm: 'Raising' },
    ],
  })
  await $.tool.call({
    tool: 'Write',
    file_path: 'src/world/engine.ts',
    content: 'a\nb\nc',
  })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(4_000)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Text', text: /Working/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0:04/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0 of 2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /World engine/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /12 passing/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /engine\.ts/ })).toBeUndefined()

    await ui.press({ key: 'toggle-changes' })
    expect(await ui.find({ type: 'Text', text: /engine\.ts/ })).toBeDefined()
    await ui.press({ key: 'toggle-changes' })
    await ui.unmount()
  }
})

const AGENT: Omit<AgentInfo, 'id' | 'status' | 'label' | 'tokenCount'> = {
  description: 'Raise the terrain',
  type: 'general-purpose',
  kind: 'local_agent',
  taskStatus: 'running',
  startTime: 0,
  cwd: '/work/the-edge',
  tokenSamples: [],
  hasRow: true,
}

const BAND = {
  plugin: 'work-monitor',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

test('the band draws a card for each agent while one runs', async ($, on) => {
  mock.clock(on, { now: 3_000 })
  let isRunning = true
  on('agent.list', () => ({
    value: [
      {
        ...AGENT,
        id: 'a1',
        name: 'terrain',
        status: isRunning ? 'running' : 'completed',
        label: 'write terrain.ts',
        tokenCount: 3_100,
      },
      {
        ...AGENT,
        id: 'a2',
        name: 'water',
        status: 'completed',
        label: 'write water.ts',
        tokenCount: 2_400,
      },
    ],
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    isRunning = true
    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Text', text: /Running 1 agent/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Raise the terrain/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /write water\.ts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /3\.1k/ })).toBeDefined()
    await ui.unmount()

    // Once every agent is over, the band is the engine's again.
    isRunning = false
    const after = await $.ui.mount({ ...BAND, surface })
    expect(await after.find({ type: 'Text', text: /Running/ })).toBeUndefined()
    await after.unmount()
  }
})

test('a value an earlier version stored is declined', async ($, on) => {
  mock.clock(on)
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.cwd', () => ({ value: '/work/the-edge' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('agent.list', () => ({ value: [] }))
  on('state.get', () => ({ value: { value: [{ old: true }], version: 1 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Idle/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /No plan yet/ })).toBeDefined()
  await ui.unmount()
})

test('a failed run never reads as passing, and echo is no test run', async ($, on) => {
  mock.clock(on)
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.cwd', () => ({ value: '/work/the-edge' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('agent.list', () => ({ value: [] }))
  on('tool.call', (_, e) =>
    e.tool === 'Bash' && e.command.includes('vendor')
      ? { isError: true, result: 'x', text: 'suite a: 12 passed, 0 failed\nboom' }
      : { result: {}, text: '5 passed' },
  )

  await $.tool.call({ tool: 'Bash', command: 'echo pytest' })
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /passing|passed/ })).toBeUndefined()
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'cd app && APP_ENV=test ./vendor/bin/phpunit' })
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /failed/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /passing/ })).toBeUndefined()
  await ui.unmount()
})

test('TodoWrite keeps the tasks TaskCreate made', async ($, on) => {
  mock.clock(on)
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.cwd', () => ({ value: '/work/the-edge' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('agent.list', () => ({ value: [] }))
  on('tool.call', (_, e) =>
    e.tool === 'TaskCreate'
      ? { result: { task: { id: '1', subject: e.subject } } }
      : { result: {} },
  )

  await $.tool.call({ tool: 'TaskCreate', subject: 'Film edit', description: 'cut' })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'Terrain', status: 'pending', activeForm: 'Raising' }],
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Film edit/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Terrain/ })).toBeDefined()
  await ui.unmount()
})
