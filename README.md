# claude-code-expand-paste

A Claude Code mod that expands collapsed clipboard text in the prompt,
so long input remains visible and editable instead of becoming
`[Pasted text #1 +42 lines]`.

<p align="center">
  <img src="assets/expand-paste.gif" alt="Demo of expanding collapsed clipboard text in Claude Code">
</p>

## Why use this?

Claude Code collapses long pasted text into a placeholder, hiding the content
you want to review before sending. This is especially frustrating when using
a dictation tool that pastes transcribed text from the clipboard: you cannot
immediately check whether your speech was transcribed correctly.

This mod expands the pasted text directly in the prompt, so you can read the
transcription, catch misheard words, and make corrections before sending it.
It also keeps other long pasted input visible and editable.

## Installation

Requires Claude Code with Mods/function hooks support enabled. TypeScript modules
load directly; no build step is needed.

Requires Claude Code v2.1.287 or later.

Clipboard access depends on your environment:

| Environment | Command used |
| --- | --- |
| macOS | `pbpaste` (included with macOS) |
| Windows | `powershell.exe` with `Get-Clipboard -Raw` |
| WSL | Windows `powershell.exe` first; Linux commands as fallback |
| Linux with Wayland | `wl-paste --no-newline` from `wl-clipboard` (preferred) |
| Linux with X11 | `xclip` or `xsel` |

On Linux, install at least one of `wl-clipboard`, `xclip`, or `xsel` for your
desktop session. WSL needs Windows command interop enabled to use `powershell.exe`;
if interop is unavailable, a Linux clipboard command can be used instead.

```text
/plugin install expand-paste --marketplace tapioca24/claude-code-expand-paste
```

Choose **Install for you** to use the mod across projects. Claude Code fetches the
repository automatically; no manual clone or startup flags are needed. Follow
any reload instructions shown after installation.

### Local development

```sh
git clone https://github.com/tapioca24/claude-code-expand-paste.git
claude --plugin-dir /absolute/path/to/claude-code-expand-paste
```

Replace the path with your clone's location. This loads the local copy for that
session only.

## Usage

Paste into the prompt as usual. Clipboard-based input from a dictation tool can
also work.

Expansion is enabled by default. To change it, use the slash command:

| Command | Effect |
| --- | --- |
| `/expand-paste` | Toggle expansion and show the new state |
| `/expand-paste on` | Enable expansion |
| `/expand-paste off` | Disable expansion |

The setting persists across sessions and is also available in `/config`
(**Expand pasted text**).

If you encounter a problem, please [open an issue](https://github.com/tapioca24/claude-code-expand-paste/issues/new).

## How it works

Claude Code first handles the paste normally. Every 250 ms, the mod checks the
prompt for a collapsed `[Pasted text #…]` placeholder. When one appears, it reads
the clipboard using the command for the current environment. If the clipboard's
newline count matches the placeholder and the placeholder was first seen within
the last second, the mod replaces it with the clipboard text. Line endings are
normalized to LF and tabs to four spaces. Existing text around the placeholder
is preserved.

The mod leaves individual edits and Claude Code's default paste processing alone.
It does not expand placeholders after the one-second window. If the clipboard
command cannot be used, it shows a message once per session and leaves the
placeholder unchanged.

## Known limitations

- Clipboard content must still be available when the placeholder is detected. If another app changes the clipboard first, expansion may fail or use different text with the same newline count.
- The one-second window starts when the placeholder is first detected, not when the paste occurred. A placeholder already present when the mod starts may be considered recent.
- Clipboard utilities or Windows command interop may be unavailable in remote, headless, or restricted environments.
