import type { EngineInterface, Register } from 'claude-code'

// Placeholder Claude Code inserts when it collapses a paste
const PLACEHOLDER = /\[Pasted text #\d+(?: \+(\d+) lines)?\]/g

// How long after a placeholder appears we try to expand it. Limited to right after
// the paste so we don't expand it with a clipboard a dictation tool has since restored
const EXPAND_WINDOW_MS = 1000

const POLL_MS = 250

const countNewlines = (s: string) => (s.match(/\r\n|\r|\n/g) ?? []).length

const powershell = [
  'powershell.exe',
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Out.Write((Get-Clipboard -Raw))',
]

async function clipboardCommands($: EngineInterface): Promise<string[][]> {
  const os = await $.env.get('OS')
  if (os === 'Windows_NT') return [powershell]

  const { stdout: uname } = await $.process.run(['uname', '-sr'])
  if (uname.startsWith('Darwin ')) return [['pbpaste']]
  if (!uname.startsWith('Linux ')) return []

  const wayland = await $.env.get('WAYLAND_DISPLAY')
  const linux = wayland
    ? [['wl-paste', '--no-newline'], ['xclip', '-selection', 'clipboard', '-o'], ['xsel', '--clipboard', '--output']]
    : [['xclip', '-selection', 'clipboard', '-o'], ['xsel', '--clipboard', '--output'], ['wl-paste', '--no-newline']]
  const wsl = await $.env.get('WSL_DISTRO_NAME')
  return wsl || /microsoft/i.test(uname) ? [powershell, ...linux] : linux
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    let commands: string[][] = []
    try {
      commands = await clipboardCommands($)
    } catch {
      // Unsupported hosts are reported only if a collapsed paste appears.
    }
    // When each placeholder was first seen; expired ones never read the clipboard.
    const firstSeen = new Map<string, number>()
    let busy = false
    let warned = false
    $.clock.every(POLL_MS, async () => {
      if (busy) return
      busy = true
      try {
        const box = await $.prompt.read()
        const matches = [...box.text.matchAll(PLACEHOLDER)]
        const present = new Set(matches.map((m) => m[0]))
        for (const key of firstSeen.keys()) {
          if (!present.has(key)) firstSeen.delete(key)
        }
        if (matches.length === 0) return

        const now = await $.clock.now()
        const candidates = matches.filter((m) => {
          const seen = firstSeen.get(m[0]) ?? now
          firstSeen.set(m[0], seen)
          return now - seen <= EXPAND_WINDOW_MS
        })
        if (candidates.length === 0) return

        let stdout: string | undefined
        for (const command of commands) {
          try {
            const result = await $.process.run(command, { timeoutMs: 5000 })
            if (result.exitCode === 0) {
              stdout = result.stdout
              break
            }
          } catch {
            // Try the next clipboard utility if this one is unavailable.
          }
        }
        if (stdout === undefined) {
          if (!warned) {
            const attempted = commands.map((command) => command[0]).join(', ')
            $.ui.log(attempted
              ? `expand-paste: Clipboard could not be read with ${attempted}. Check the required command (see README).`
              : 'expand-paste: Clipboard could not be read on this OS (see README).')
            warned = true
          }
          return
        }
        const clip = stdout.replace(/\r\n|\r/g, '\n').replaceAll('\t', '    ')
        if (clip.length === 0) return
        // Expand only when the clipboard matches the pasted content
        const m = candidates.find((c) => countNewlines(clip) === Number(c[1] ?? 0))
        if (!m || m.index === undefined) return
        const text = box.text.slice(0, m.index) + clip + box.text.slice(m.index + m[0].length)
        firstSeen.delete(m[0])
        await $.prompt.fill({ text, mode: 'replace' })
      } finally {
        busy = false
      }
    })
    return r
  })
}
