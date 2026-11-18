import { expect, test } from 'claude-code/testing'

const ROW = {
  plugin: 'answer-card',
  component: 'AssistantMessage',
  requestId: 'm1',
} as const

test('only the reply a turn ended on gets the card', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.turn.complete({
    answer: 'All  done.\nThe build passes.',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await $.turn.complete({
    answer: 'A subagent report.',
    durationMs: 1,
    isAborted: false,
    turnId: 't2',
    agentId: 'a1',
    reason: 'answer',
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const answer = await $.ui.mount({
      ...ROW,
      surface,
      props: { text: 'All done. The build passes.', isFirstOfReply: true },
    })
    expect(await answer.find({ type: 'Box' })).toBeDefined()
    expect((await answer.find({ type: 'Text' }))?.text).toBe('engine')
    await answer.unmount()

    for (const text of ['Reading the files now.', 'A subagent report.']) {
      const other = await $.ui.mount({
        ...ROW,
        surface,
        props: { text, isFirstOfReply: true },
      })
      expect(await other.find({ type: 'Box' })).toBeUndefined()
      await other.unmount()
    }
  }
})
