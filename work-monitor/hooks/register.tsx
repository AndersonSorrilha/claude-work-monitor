import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { FileChange, PlanItem, TestRun, Turn } from '../types'

const PANE = 'work-monitor'
const TITLE = 'Monitor'
const OPEN = { id: PANE, title: TITLE, columns: 44 } as const

const IDLE: Turn = { isWorking: false, startedAt: 0, endedAt: 0 }

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const turn = atom({ plugin: 'work-monitor', key: 'turn' } as const, IDLE, {
  shape: 'turn-1',
})
const plan = atom({ plugin: 'work-monitor', key: 'plan' } as const, [], {
  shape: 'plan-1',
})
const changes = atom({ plugin: 'work-monitor', key: 'changes' } as const, [], {
  shape: 'changes-1',
})
const files = atom({ plugin: 'work-monitor', key: 'files' } as const, [], {
  shape: 'files-1',
})
const tests = atom({ plugin: 'work-monitor', key: 'tests' } as const, [], {
  shape: 'tests-1',
})
const open = atom(
  { plugin: 'work-monitor', key: 'open' } as const,
  {},
  { shape: 'open-1' },
)
// The pane reads it only to be drawn again each second while a turn runs.
const now = atom({ plugin: 'work-monitor', key: 'now' } as const, 0)

const TEST_RUNNER =
  /^((npm|pnpm|yarn|bun)\s+(run\s+)?test\b|(pytest|vitest|jest|mocha|phpunit|pest|rspec)\b|(go|cargo|dotnet|deno|mvn|gradle|gradlew|make)\s+test\b|artisan\s+test\b|claude\s+plugin\s+test\b)/

// What a command line runs, a part at a time: variables set ahead of it and the
// launchers in front of a runner are dropped, so `echo pytest` is no test run.
const isTestCommand = (command: string) =>
  command.split(/&&|\|\||[;|\n]/).some(part =>
    TEST_RUNNER.test(
      part
        .trim()
        .replace(/^(\w+=\S*\s+)+/, '')
        .replace(/^(npx|bunx|pnpm\s+exec|yarn\s+exec|python3?\s+-m|php|uv\s+run|poetry\s+run)\s+/, '')
        .replace(/^(\.\/)?(vendor\/bin\/|node_modules\/\.bin\/)?(\.\/)?/, ''),
    ),
  )

const lineCount = (text: string) => (text === '' ? 0 : text.split('\n').length)

const baseName = (path: string) => path.split(/[\\/]/).pop() || path

const elapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`
}

const compact = (tokens: number) =>
  tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)

const meter = (percent: number, cells: number) => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * cells)

  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

const isOver = (status: string) =>
  status === 'completed' || status === 'failed' || status === 'killed'

// A bar with no known end: a short lit run that walks the track each second.
const sweep = (step: number, cells: number) => {
  const run = Math.max(2, Math.floor(cells / 4))
  const start = step % Math.max(1, cells - run + 1)

  return '─'.repeat(start) + '━'.repeat(run) + '─'.repeat(cells - run - start)
}

// The last count of a kind in the output: a runner prints its totals last.
const lastCount = (text: string, words: RegExp) => {
  let count: number | undefined

  for (const found of text.matchAll(words)) {
    count = Number(found[1])
  }

  return count
}

const testSummary = (text: string, isPassing: boolean) => {
  const passed = lastCount(text, /(\d+)\s+(passing|passed|pass)\b/gi)
  const failed = lastCount(text, /(\d+)\s+(failing|failed|fail)\b/gi)

  if (failed !== undefined && failed > 0) {
    return passed === undefined
      ? `${failed} failing`
      : `${failed} failing, ${passed} passing`
  }

  // A command that failed never reads as passing, whatever counts it printed.
  if (!isPassing) {
    return 'failed'
  }

  return passed === undefined ? 'passed' : `${passed} passing`
}

async function record($: EngineInterface, change: FileChange) {
  await update($, changes, list => {
    const was = list.find(one => one.path === change.path)
    const merged: FileChange = {
      path: change.path,
      added: (was?.added ?? 0) + change.added,
      removed: (was?.removed ?? 0) + change.removed,
    }

    return [...list.filter(one => one.path !== change.path), merged].slice(-100)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'monitor',
      description: 'Show the work monitor pane: plan, changes, tests, agents',
    })
    void $.ui.open(OPEN)

    let ticks = 0
    let hasLive = false
    $.clock.every(1000, () => {
      void (async () => {
        ticks += 1
        const { isWorking } = await read($, turn)
        if (ticks % 5 === 0) {
          hasLive = (await $.agent.list()).some(agent => !isOver(agent.status))
        }

        // Between turns, only a background agent still moves the pane.
        const isMoving = isWorking || hasLive

        if (isMoving) {
          const at = await $.clock.now()
          await update($, now, () => at)
        }
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'monitor' }, async $ => {
    await $.ui.open(OPEN)

    return { text: 'Work monitor opened.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const startedAt = await $.clock.now()
      await update($, turn, () => ({ isWorking: true, startedAt, endedAt: 0 }))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const endedAt = await $.clock.now()
      await update($, turn, was => ({ ...was, isWorking: false, endedAt }))
    }

    return next(e)
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      const items: PlanItem[] = e.todos.map((todo, index) => ({
        id: `todo-${index}`,
        subject: todo.content,
        status: todo.status,
      }))
      await update($, plan, list => [
        ...list.filter(one => !one.id.startsWith('todo-')),
        ...items,
      ])
    }

    return ran
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      const item: PlanItem = {
        id: ran.result.task.id,
        subject: ran.result.task.subject,
        status: 'pending',
      }
      await update($, plan, list => [
        ...list.filter(one => one.id !== item.id),
        item,
      ])
    }

    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny !== undefined || ran.isError === true) {
      return ran
    }

    const { taskId, status, subject } = e
    await update($, plan, list => {
      if (status === 'deleted') {
        return list.filter(one => one.id !== taskId)
      }

      // A task made before the mod loaded is first heard of here.
      const known = list.some(one => one.id === taskId)
        ? list
        : [...list, { id: taskId, subject: `Task ${taskId}`, status: 'pending' as const }]

      return known.map(one =>
        one.id === taskId
          ? {
              ...one,
              subject: subject ?? one.subject,
              status: status ?? one.status,
            }
          : one,
      )
    })

    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      await record($, {
        path: e.file_path,
        added: lineCount(e.content),
        removed: 0,
      })
    }

    return ran
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      await record($, {
        path: e.file_path,
        added: lineCount(e.new_string),
        removed: lineCount(e.old_string),
      })
    }

    return ran
  })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      const path = e.file_path
      await update($, files, list =>
        [...list.filter(one => one !== path), path].slice(-100),
      )
    }

    return ran
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && isTestCommand(e.command)) {
      const isPassing = ran.isError !== true
      const run: TestRun = {
        command: e.command.trim().slice(0, 60),
        isPassing,
        summary: testSummary(ran.text ?? '', isPassing),
      }
      await update($, tests, list => [...list, run].slice(-20))
    }

    return ran
  })

  // The grid of agent cards in the chat column, above the prompt, for as long
  // as an agent runs.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const at = await read($, now)
    const agents = await $.agent.list()
    const live = agents.filter(agent => !isOver(agent.status))

    if (e.props.hasSurvey || live.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    const perRow = columns >= 96 ? 4 : columns >= 48 ? 2 : 1
    const width = Math.max(16, Math.floor(columns / perRow) - 1)
    const inner = width - 4
    const step = Math.floor(at / 1000)

    return (
      <Box flexDirection="column">
        <Text>
          <Text color="claude">⠿</Text>{' '}
          <Text weight="bold">
            Running {live.length} {live.length === 1 ? 'agent' : 'agents'}
          </Text>
          <Text dimColor>
            {'  '}
            in parallel
            {agents.length > live.length &&
              `, ${agents.length - live.length} finished`}
          </Text>
        </Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {agents.slice(-12).map(agent => {
            const isDone = agent.status === 'completed'
            const hasFailed = agent.status === 'failed' || agent.status === 'killed'
            const title = agent.description || agent.name || agent.type
            const summary = agent.label.split('\n')[0] ?? ''
            // With no progress summary yet the label repeats the description.
            const activity =
              summary === '' || summary === title ? agent.type : summary

            return (
              <Box
                flexDirection="column"
                width={width}
                paddingX={1}
                borderStyle="round"
                borderColor={hasFailed ? 'error' : isDone ? 'success' : 'subtle'}
              >
                <Box justifyContent="space-between">
                  <Text weight="bold" wrap="truncate-end">
                    <Text color="claude">⠿</Text> {title}
                  </Text>
                  <Text dimColor tabular>
                    {' '}
                    {isDone ? 'done' : hasFailed ? agent.status : compact(agent.tokenCount)}
                  </Text>
                </Box>
                <Text dimColor wrap="truncate-end">
                  {activity}
                </Text>
                <Text color={hasFailed ? 'error' : isDone ? 'success' : 'claude'}>
                  {isDone || hasFailed ? '━'.repeat(inner) : sweep(step, inner)}
                </Text>
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Progress, Text } = $.ui.resolve(e)

    await read($, now)
    const state = await read($, turn)
    const items = await read($, plan)
    const changed = await read($, changes)
    const seen = await read($, files)
    const runs = await read($, tests)
    const isOpen = await read($, open)
    const [at, model, cwd, usage, agents] = await Promise.all([
      $.clock.now(),
      $.session.model(),
      $.session.cwd(),
      $.session.usage(),
      $.agent.list(),
    ])

    const clock = elapsed(
      state.startedAt === 0
        ? 0
        : (state.isWorking ? at : state.endedAt) - state.startedAt,
    )
    const done = items.filter(one => one.status === 'completed').length
    const status = state.isWorking ? 'Working' : 'Idle'

    if (e.props.placement === 'widget') {
      return (
        <Text>
          <Text color={state.isWorking ? 'claude' : 'inactive'}>●</Text> {status}{' '}
          <Text weight="bold" tabular>
            {clock}
          </Text>
          {items.length > 0 && (
            <Text dimColor>
              {' '}
              · {done} of {items.length}
            </Text>
          )}
        </Text>
      )
    }

    const added = changed.reduce((sum, one) => sum + one.added, 0)
    const removed = changed.reduce((sum, one) => sum + one.removed, 0)
    const running = agents.filter(agent => agent.status === 'running').length
    const lastRun = runs[runs.length - 1]
    const percent = usage.context.percent ?? 0
    const cells = Math.max(8, Math.min(24, e.props.bodyColumns - 8))

    const section = (
      id: string,
      title: string,
      summary: string,
      body: () => RenderChildren,
    ) => (
      <Box flexDirection="column">
        <Button
          key={`toggle-${id}`}
          plain
          onPress={() =>
            update($, open, was => ({ ...was, [id]: was[id] !== true }))
          }
        >
          {isOpen[id] === true ? '▾' : '▸'} {title}
          {summary !== '' && <Text dimColor>  {summary}</Text>}
        </Button>
        {isOpen[id] === true && (
          <Box flexDirection="column" paddingLeft={2}>
            {body()}
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text weight="bold">
            <Text color={state.isWorking ? 'claude' : 'inactive'}>●</Text>{' '}
            {status}
          </Text>
          <Text>
            <Text dimColor>ELAPSED </Text>
            <Text weight="bold" tabular>
              {clock}
            </Text>
          </Text>
        </Box>
        <Text dimColor wrap="truncate-end">
          {model} · {baseName(cwd)}
        </Text>

        <Box justifyContent="space-between" marginTop={1}>
          <Text weight="bold">Plan</Text>
          <Text dimColor>
            {done} of {items.length}
          </Text>
        </Box>
        {items.length === 0 && <Text dimColor>No plan yet.</Text>}
        {items.map(one => (
          <Text
            wrap="truncate-end"
            dimColor={one.status === 'pending'}
            weight={one.status === 'in_progress' ? 'bold' : 'regular'}
          >
            {one.status === 'completed' ? (
              <Text color="success">✔</Text>
            ) : one.status === 'in_progress' ? (
              <Text color="claude">◐</Text>
            ) : (
              '○'
            )}{' '}
            {one.subject}
          </Text>
        ))}

        <Box flexDirection="column" marginTop={1}>
          {section(
            'changes',
            'Changes',
            changed.length === 0
              ? ''
              : `${changed.length} files  +${added} −${removed}`,
            () =>
              changed.length === 0 ? (
                <Text dimColor>No edits yet.</Text>
              ) : (
                changed.slice(-12).map(one => (
                  <Box justifyContent="space-between">
                    <Text wrap="truncate-start">{baseName(one.path)}</Text>
                    <Text>
                      {' '}
                      <Text color="success">+{one.added}</Text>{' '}
                      <Text color="error">−{one.removed}</Text>
                    </Text>
                  </Box>
                ))
              ),
          )}
          {section('files', 'Files', seen.length === 0 ? '' : `${seen.length} read`, () =>
            seen.length === 0 ? (
              <Text dimColor>No files read yet.</Text>
            ) : (
              seen.slice(-12).map(path => (
                <Text dimColor wrap="truncate-start">
                  {baseName(path)}
                </Text>
              ))
            ),
          )}
          {section('tests', 'Tests', lastRun?.summary ?? '', () =>
            runs.length === 0 ? (
              <Text dimColor>No test runs yet.</Text>
            ) : (
              runs.slice(-5).map(run => (
                <Text wrap="truncate-end">
                  <Text color={run.isPassing ? 'success' : 'error'}>
                    {run.isPassing ? '✔' : '✘'}
                  </Text>{' '}
                  {run.summary} <Text dimColor>{run.command}</Text>
                </Text>
              ))
            ),
          )}
          {section(
            'agents',
            'Agents',
            agents.length === 0 ? '' : `${running} running of ${agents.length}`,
            () =>
              agents.length === 0 ? (
                <Text dimColor>No agents spawned.</Text>
              ) : (
                agents.slice(-8).map(agent => (
                  <Box flexDirection="column">
                    <Box justifyContent="space-between">
                      <Text weight="bold" wrap="truncate-end">
                        {agent.name ?? agent.description}
                      </Text>
                      <Text dimColor> {agent.status}</Text>
                    </Box>
                    <Progress
                      label={(agent.label.split('\n')[0] || agent.type).slice(0, 40)}
                      value={
                        agent.status === 'completed'
                          ? 1
                          : agent.status === 'failed' || agent.status === 'killed'
                            ? 0
                            : undefined
                      }
                      valueText={`${compact(agent.tokenCount)} tok`}
                    />
                  </Box>
                ))
              ),
          )}
          {section('context', 'Context', `${percent}%`, () => (
            <Box flexDirection="column">
              <Text>
                <Text color={percent >= 80 ? 'warning' : 'claude'}>
                  {meter(percent, cells)}
                </Text>{' '}
                {percent}%
              </Text>
              <Text dimColor>
                {compact(usage.context.tokens ?? 0)} of{' '}
                {compact(usage.context.window)} tokens
              </Text>
              {usage.cost !== undefined && (
                <Text dimColor>est. cost ${usage.cost.usd.toFixed(2)}</Text>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
