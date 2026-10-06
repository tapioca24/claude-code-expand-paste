import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ConfigValue, On, ProcessRunResult } from 'claude-code'

type World = { reads: number; configSets: ConfigValue[] }

// Answers what the mod calls beneath it and records what it did.
function world(on: On): World {
  const w: World = { reads: 0, configSets: [] }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('config.set', ($, e) => {
    w.configSets.push(e.value)
    return { value: e.value }
  })
  on('prompt.read', () => {
    w.reads++
    return { value: { text: '', cursor: 0 } }
  })
  mock.env(on, {})
  const uname: ProcessRunResult = { exitCode: 0, stdout: 'Darwin 25.6.0', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
  on('process.run', () => ({ value: uname }))
  return w
}

const start = ($: Engine) => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

const run = async ($: Engine, args: string) =>
  (await $.command.run({
    command: 'expand-paste',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })).text

describe('/expand-paste', () => {
  test('toggles with no argument and reports the new state', async ($, on) => {
    mock.clock(on)
    const w = world(on)
    await start($)
    expect(await run($, '')).toBe('expand-paste: disabled')
    expect(await run($, '')).toBe('expand-paste: enabled')
    expect(w.configSets).toEqual([false, true])
  })

  test('on/off set the state explicitly, case and spaces ignored', async ($, on) => {
    mock.clock(on)
    const w = world(on)
    await start($)
    expect(await run($, ' OFF ')).toBe('expand-paste: disabled')
    expect(await run($, 'on')).toBe('expand-paste: enabled')
    expect(w.configSets).toEqual([false, true])
  })

  test('already in that state: says so and leaves the setting alone', async ($, on) => {
    mock.clock(on)
    const w = world(on)
    await start($)
    expect(await run($, 'on')).toBe('expand-paste: already enabled')
    expect(w.configSets).toEqual([])
  })

  test('unknown argument: changes nothing and shows usage', async ($, on) => {
    mock.clock(on)
    const w = world(on)
    await start($)
    expect(await run($, 'foo')).toBe(
      'expand-paste: unknown argument "foo". Usage: /expand-paste [on|off] (currently enabled)',
    )
    expect(w.configSets).toEqual([])
  })
})

describe('polling', () => {
  test('polls the prompt while enabled', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on)
    await start($)
    await clock.advance(1000)
    expect(w.reads).toBeGreaterThan(0)
  })

  test('does not poll when disabled in settings', { options: { enabled: false } }, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on)
    await start($)
    await clock.advance(1000)
    expect(w.reads).toBe(0)
    expect(await run($, '')).toBe('expand-paste: enabled')
  })

  test('stops polling once turned off', async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on)
    await start($)
    await run($, 'off')
    const before = w.reads
    await clock.advance(1000)
    expect(w.reads).toBe(before)
  })
})
