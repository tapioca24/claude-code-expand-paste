import type { On } from 'claude-code'

export function register(on: On): void {
  on('prompt.edit', ($, e, next) => {
    // Missing key metadata covers paste AND batched input, not just clipboard use.
    // Leave individual keys, deletions, and cursor moves to the editor.
    if (e.key !== undefined || e.inputText.length === 0) {
      return next(e)
    }

    // Apply the splice directly, bypassing the default paste handler.
    // String slicing and length use the API's UTF-16 cursor offsets.
    return {
      text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end),
      cursor: e.start + e.inputText.length,
    }
  })
}
