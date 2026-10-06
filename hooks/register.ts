import type { EngineInterface, Register, Timer } from 'claude-code'

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

const COMMAND = 'expand-paste'
const CONFIG_KEY = 'expand-paste.enabled'
const USAGE = `/${COMMAND} [on|off]`

const describe = (enabled: boolean) => (enabled ? 'enabled' : 'disabled')

let enabled = true
let poller: Timer | undefined

// Starts or stops polling to match `enabled`.
async function apply($: EngineInterface) {
  if (enabled && !poller) poller = await startPolling($)
  if (!enabled && poller) {
    poller.cancel()
    poller = undefined
  }
}

export const register: Register = (on, options) => {
  enabled = options.enabled !== false
  poller = undefined

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // Start expanding first so a failed command registration does not disable it.
    await apply($)
    await $.command.register({
      name: COMMAND,
      description: 'Toggle expand-paste',
      argumentHint: '[on|off]',
    })
    return r
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    let want: boolean
    if (arg === '') want = !enabled
    else if (arg === 'on' || arg === 'off') want = arg === 'on'
    else {
      return { text: `${COMMAND}: unknown argument "${e.args.trim()}". Usage: ${USAGE} (currently ${describe(enabled)})` }
    }
    if (want === enabled) return { text: `${COMMAND}: already ${describe(enabled)}` }

    const { deny } = await $.config.set({ key: CONFIG_KEY, value: want })
    if (deny) return { text: `${COMMAND}: could not change the setting: ${deny} (currently ${describe(enabled)})` }
    // Apply now too, in case the setting change does not reload the module.
    enabled = want
    await apply($)
    return { text: `${COMMAND}: ${describe(enabled)}` }
  })
}

async function startPolling($: EngineInterface): Promise<Timer> {
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
  return $.clock.every(POLL_MS, async () => {
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
}
