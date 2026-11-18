/** The end of a final answer, whitespace collapsed: what a reply is matched by. */
export type AnswerTail = string

declare module 'claude-code' {
  interface PluginState {
    'answer-card': { answers: Shaped<AnswerTail[]> }
  }
}
