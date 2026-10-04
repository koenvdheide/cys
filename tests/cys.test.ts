import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__cys__register'
const CWD = 'C:\\work'
const UPSTREAM = 'context from another hook'

type World = {
  session: string
  cwd: string
  existing: Set<string>
  store: Map<string, unknown>
  registered: unknown[]
  refuse?: (key: string, value: unknown) => boolean
  existsDeny?: Set<string>
  dangling?: Set<string>
  stopResult?: Awaited<ReturnType<Engine['classic']['Stop']>>
}

// Op stubs answer { value } or { deny }; a deny rejects the module's call,
// which is how a real store refusal reaches it.
function world(on: On, init: Partial<World> = {}): World {
  const w: World = { session: 'session-a', cwd: CWD, existing: new Set(), store: new Map(), registered: [], ...init }
  on('session.id', async () => ({ value: w.session }))
  on('session.cwd', async () => ({ value: w.cwd }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('fs.exists', async ($, e) => (w.existsDeny?.has(e.path) ? { deny: 'network location' } : { value: w.existing.has(e.path) }))
  on('fs.stat', async ($, e) => {
    if (w.existsDeny?.has(e.path)) return { deny: 'network location' }
    if (w.existing.has(e.path)) return { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }
    if (w.dangling?.has(e.path)) return { value: { kind: 'other', size: 0, mtimeMs: 0, isLink: true } }
    return { deny: 'ENOENT: no such file or directory' }
  })
  on('store.keys', async () => ({ value: [...w.store.keys()] }))
  on('store.get', async ($, e) => ({ value: w.store.get(e.key) }))
  on('store.delete', async ($, e) => {
    w.store.delete(e.key)
    return { value: undefined }
  })
  on('store.set', async ($, e) => {
    if (w.refuse?.(e.key, e.value)) return { deny: 'store refused the key' }
    w.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('tool.register', async ($, e) => {
    w.registered.push(e)
    return { value: { tool: `mcp__cys__${e.name}` } }
  })
  on('classic.Stop', async () => w.stopResult ?? { additionalContext: [UPSTREAM] })
  on('classic.SubagentStart', async () => ({ additionalContext: [UPSTREAM] }))
  // Bottom answer for a tool.call no plugin answered, so a test against an
  // empty module fails on its assertions instead of a harness error.
  on('tool.call', async () => ({ result: '' }))
  return w
}

const stored = (w: World, session: string) =>
  [...w.store].filter(([key]) => key.startsWith(`${session}\n`)).map(([, value]) => value).sort()

let calls = 0
const register = ($: Engine, paths: unknown[]) =>
  $.tool.call({ tool: TOOL, tool_use_id: `t${++calls}`, paths })

const stop = ($: Engine, session: string, fields: Partial<Parameters<Engine['classic']['Stop']>[0]> = {}) =>
  $.classic.Stop({ session_id: session, stop_hook_active: false, background_tasks: [], ...fields })

const NETWORK = 'not registered (network or device path)'
const DRIVE_RELATIVE = 'not registered (drive-relative path)'
const NOT_WINDOWS = 'not registered (not an absolute Windows path such as C:\\...)'
const NOT_ABSOLUTE = 'not registered (not an absolute path)'

test('session.start registers the tool with a required non-empty paths array', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: CWD, surface: null, isInteractive: false })
  expect(w.registered).toEqual([
    expect.objectContaining({
      name: 'register',
      inputSchema: {
        type: 'object',
        properties: { paths: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        required: ['paths'],
      },
    }),
  ])
})

test('on Windows, registers drive paths and rejects each other form with its reason', async ($, on) => {
  const w = world(on)
  const ran = await register($, [
    'C:\\tmp\\a.txt', 'C:/tmp/b.txt', 'rel\\a.txt', 'C:a.txt', '\\\\s\\x', '//s/x', '\\/s/x', '/\\s\\x', '/c/Users/x',
  ])
  expect(String(ran.result).split('\n')).toEqual([
    'registered: C:\\tmp\\a.txt',
    'registered: C:/tmp/b.txt',
    `${NOT_WINDOWS}: rel\\a.txt`,
    `${DRIVE_RELATIVE}: C:a.txt`,
    `${NETWORK}: \\\\s\\x`,
    `${NETWORK}: //s/x`,
    `${NETWORK}: \\/s/x`,
    `${NETWORK}: /\\s\\x`,
    `${NOT_WINDOWS}: /c/Users/x`,
  ])
  expect(stored(w, 'session-a')).toEqual(['C:/tmp/b.txt', 'C:\\tmp\\a.txt'])
})

test('a UNC working directory still counts as Windows', async ($, on) => {
  const w = world(on, { cwd: '\\\\server\\share\\repo' })
  const ran = await register($, ['C:\\tmp\\a.txt', '/c/Users/x'])
  expect(String(ran.result).split('\n')).toEqual(['registered: C:\\tmp\\a.txt', `${NOT_WINDOWS}: /c/Users/x`])
  expect(stored(w, 'session-a')).toEqual(['C:\\tmp\\a.txt'])
})

test('on POSIX, registers rooted paths and rejects network, relative and Windows forms', async ($, on) => {
  const w = world(on, { cwd: '/home/u' })
  const ran = await register($, ['/tmp/a', '//s/x', 'rel/a', 'C:\\x', 'C:x'])
  expect(String(ran.result).split('\n')).toEqual([
    'registered: /tmp/a',
    `${NETWORK}: //s/x`,
    `${NOT_ABSOLUTE}: rel/a`,
    `${NOT_ABSOLUTE}: C:\\x`,
    `${DRIVE_RELATIVE}: C:x`,
  ])
  expect(stored(w, 'session-a')).toEqual(['/tmp/a'])
})

test('a path over 300 characters registers and is listed at the next Stop', async ($, on) => {
  const long = 'C:\\' + 'x'.repeat(300)
  world(on, { existing: new Set([long]), refuse: key => key.length > 256 })
  const ran = await register($, [long])
  expect(ran.result).toBe(`registered: ${long}`)
  const result = await stop($, 'session-a')
  expect(result.additionalContext?.[1]).toContain(long)
})

test('a refused store write is reported and the other paths still register', async ($, on) => {
  const w = world(on, { refuse: (_key, value) => String(value).includes('refuse-me') })
  const ran = await register($, ['C:\\tmp\\refuse-me', 'C:\\tmp\\b.txt'])
  expect(String(ran.result).split('\n')).toEqual([
    'not registered (store refused it): C:\\tmp\\refuse-me',
    'registered: C:\\tmp\\b.txt',
  ])
  expect(stored(w, 'session-a')).toEqual(['C:\\tmp\\b.txt'])
})

test('Stop lists existing paths of its own session once, keeps upstream context and consumes its keys', async ($, on) => {
  const w = world(on, { existing: new Set(['C:\\tmp\\here']) })
  w.session = 'session-b'
  await register($, ['C:\\tmp\\other'])
  w.session = 'session-a'
  await register($, ['C:\\tmp\\here', 'C:\\tmp\\gone'])
  const first = await stop($, 'session-a')
  expect(first.additionalContext?.length).toBe(2)
  expect(first.additionalContext?.[0]).toBe(UPSTREAM)
  expect(first.additionalContext?.[1]).toStartWith('CYS has registered temporary paths to review:\n')
  expect(first.additionalContext?.[1]).toContain('C:\\tmp\\here')
  expect(first.additionalContext?.[1]).not.toContain('C:\\tmp\\gone')
  expect(first.additionalContext?.[1]).not.toContain('C:\\tmp\\other')
  expect(stored(w, 'session-b')).toEqual(['C:\\tmp\\other'])
  expect(w.store.size).toBe(1)
  const second = await stop($, 'session-a')
  expect(second.additionalContext).toEqual([UPSTREAM])
})

test('Stop lists a path whose existence check is refused and still lists the others', async ($, on) => {
  const w = world(on, { existing: new Set(['C:\\tmp\\here']), existsDeny: new Set(['Z:\\share\\x']) })
  await register($, ['C:\\tmp\\here', 'Z:\\share\\x'])
  const result = await stop($, 'session-a')
  expect(result.additionalContext?.length).toBe(2)
  expect(result.additionalContext?.[0]).toBe(UPSTREAM)
  expect(result.additionalContext?.[1]).toContain('C:\\tmp\\here')
  expect(result.additionalContext?.[1]).toContain('Z:\\share\\x')
  expect(w.store.size).toBe(0)
})

test('Stop lists a dangling symlink, as lexists did', async ($, on) => {
  const w = world(on, { existing: new Set(['C:\\tmp\\here']), dangling: new Set(['C:\\tmp\\link']) })
  await register($, ['C:\\tmp\\here', 'C:\\tmp\\link', 'C:\\tmp\\gone'])
  const result = await stop($, 'session-a')
  expect(result.additionalContext?.length).toBe(2)
  expect(result.additionalContext?.[0]).toBe(UPSTREAM)
  expect(result.additionalContext?.[1]).toContain('C:\\tmp\\here')
  expect(result.additionalContext?.[1]).toContain('C:\\tmp\\link')
  expect(result.additionalContext?.[1]).not.toContain('C:\\tmp\\gone')
  expect(w.store.size).toBe(0)
})

test('Stop returns next(e) unchanged during a continuation or background work, then lists at a regular Stop', async ($, on) => {
  const w = world(on, { existing: new Set(['C:\\tmp\\here']) })
  await register($, ['C:\\tmp\\here'])
  for (const fields of [{ stop_hook_active: true }, { background_tasks: [{ id: 'b1', type: 'subagent', status: 'running', description: 'review' }] }]) {
    const waited = await stop($, 'session-a', fields)
    expect(waited.additionalContext).toEqual([UPSTREAM])
    expect(stored(w, 'session-a')).toEqual(['C:\\tmp\\here'])
  }
  const regular = await stop($, 'session-a')
  expect(regular.additionalContext?.[1]).toContain('C:\\tmp\\here')
})

test('Stop leaves registrations alone when another hook stops the session, then lists them', async ($, on) => {
  const w = world(on, { existing: new Set(['C:\\tmp\\here']), stopResult: { preventContinuation: true } })
  await register($, ['C:\\tmp\\here'])
  expect(await stop($, 'session-a')).toEqual({ preventContinuation: true })
  expect(stored(w, 'session-a')).toEqual(['C:\\tmp\\here'])
  w.stopResult = undefined
  const later = await stop($, 'session-a')
  expect(later.additionalContext?.[1]).toContain('C:\\tmp\\here')
})

test('registering a consumed path again lists it at the next Stop', async ($, on) => {
  const w = world(on, { existing: new Set(['C:\\tmp\\here']) })
  await register($, ['C:\\tmp\\here'])
  const first = await stop($, 'session-a')
  expect(first.additionalContext?.[1]).toContain('C:\\tmp\\here')
  expect(w.store.size).toBe(0)
  await register($, ['C:\\tmp\\here'])
  const again = await stop($, 'session-a')
  expect(again.additionalContext?.[1]).toContain('C:\\tmp\\here')
})

test('after the session id changes without session.start, registrations go under the new id', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: CWD, surface: null, isInteractive: false })
  w.session = 'session-c'
  await register($, ['C:\\tmp\\after-clear'])
  expect(stored(w, 'session-c')).toEqual(['C:\\tmp\\after-clear'])
})

test('stored entries are listed by their own session on resume and not by a fork', async ($, on) => {
  world(on, { existing: new Set(['C:\\tmp\\left']) })
  await register($, ['C:\\tmp\\left'])
  const fork = await stop($, 'session-fork')
  expect(fork.additionalContext).toEqual([UPSTREAM])
  const resumed = await stop($, 'session-a')
  expect(resumed.additionalContext?.[1]).toContain('C:\\tmp\\left')
})

test('SubagentStart keeps upstream context and adds the CYS instruction', async ($, on) => {
  world(on)
  const result = await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'general-purpose' })
  expect(result.additionalContext?.length).toBe(2)
  expect(result.additionalContext?.[0]).toBe(UPSTREAM)
  expect(result.additionalContext?.[1]).toContain('mcp__cys__register')
  expect(result.additionalContext?.[1]).toContain('final report')
})
