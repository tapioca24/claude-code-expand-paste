# claude-code-expand-paste

A Claude Code mod that inserts pasted and batched text directly into the prompt,
so long input can remain visible and editable instead of becoming
`[Pasted text #1 +42 lines]`.

## Install

Requires Claude Code with Mods/function hooks support enabled. TypeScript modules
load directly; no dependencies or build step are needed.

In Claude Code v2.1.275 or later, run:

```text
/plugin install claude-code-expand-paste --marketplace tapioca24/claude-code-expand-paste
```

Choose **Install for you** to use the mod across projects. Claude Code fetches the
repository automatically; no manual clone or startup flags are needed. Follow
any reload instructions shown after installation.

Alternatively, add the marketplace and install separately:

```text
/plugin marketplace add tapioca24/claude-code-expand-paste
/plugin install claude-code-expand-paste@claude-code-expand-paste
```

### Local development

```sh
git clone https://github.com/tapioca24/claude-code-expand-paste.git
claude --plugin-dir /absolute/path/to/claude-code-expand-paste
```

Replace the path with your clone's location. This loads the local copy for that
session only.

## Usage

Paste into the prompt as usual, or use a dictation tool such as Typeless.
No commands or configuration are required.

The mod handles `prompt.edit` events with no individual key and nonempty input.
This includes paste and batched edits, potentially from IME or dictation; the API
does not identify the input source. It replaces `start` through `end` and places
the cursor after the inserted text, preserving the surrounding draft. Individual
key events, deletions, and cursor moves use Claude Code's normal handler.

For handled edits, it returns `{ text, cursor }` without calling `next(e)`, skipping
subsequent edit handlers and the default paste processing. It does not expand
placeholders already in the draft.

Implementation follows the [official Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)
and [published types](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts).
Live collapse prevention and IME/Typeless behavior have not been verified;
manual testing is still required on your Claude Code version.
