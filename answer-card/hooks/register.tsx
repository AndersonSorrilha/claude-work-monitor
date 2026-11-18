import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// The end of each final answer of the main conversation, newest last: enough
// to tell the reply a turn ended on from what the model said along the way.
const answers = atom({ plugin: 'answer-card', key: 'answers' } as const, [], {
  shape: 'answers-1',
})

const TAIL = 160

const tailOf = (text: string) => text.replace(/\s+/g, ' ').trim().slice(-TAIL)

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const tail = tailOf(e.answer)

    if (e.agentId === undefined && tail !== '') {
      await update($, answers, list =>
        [...list.filter(one => one !== tail), tail].slice(-200),
      )
    }

    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const tail = tailOf(e.props.text)
    const isAnswer = tail !== '' && (await read($, answers)).includes(tail)

    if (!isAnswer) {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="success"
        paddingX={1}
      >
        {await next(e)}
      </Box>
    )
  })
}
