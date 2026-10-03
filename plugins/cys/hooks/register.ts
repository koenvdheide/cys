import type { Register } from 'claude-code'

const TOOL = 'mcp__cys__register'

const DESCRIPTION =
  'Register temporary files or directories you created for this task, by exact absolute path, right after creating them. ' +
  'Use the native path form of this machine (C:\\... on Windows, /... elsewhere). ' +
  'Also register the paths your subagents report. Never register deliverables or files that existed before the task. ' +
  'CYS never deletes anything: at the end of the turn it lists the registered paths still on disk once, so you can delete what is no longer needed.'

const SUBAGENT_CONTEXT =
  'CYS: if you have the mcp__cys__register tool, register each temporary file or directory you create with it. ' +
  'Otherwise list their absolute paths in your final report, so the main agent registers them.'

const cleanupText = (paths: string[]) =>
  'CYS has registered temporary paths still present:\n' +
  paths.join('\n') +
  '\nReview ownership and whether each is still needed. Delete only task-created disposable paths; ' +
  'preserve user, pre-existing, tracked, and needed files. Report any path you keep and why. ' +
  'Do this cleanup pass once, then finish.'

// $.fs.exists rejects network locations, and a throwing Stop hook is skipped,
// so such a path would silence the cleanup prompt for every other path.
const rejection = (path: string, isWindows: boolean) => {
  if (/^[\\/][\\/]/.test(path)) return 'network or device path'
  if (/^[A-Za-z]:(?![\\/])/.test(path)) return 'drive-relative path'
  if (isWindows ? /^[A-Za-z]:[\\/]/.test(path) : path.startsWith('/')) return undefined
  return isWindows ? 'not an absolute Windows path such as C:\\...' : 'not an absolute path'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'register',
      description: DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: { paths: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        required: ['paths'],
      },
    })
    return next(e)
  })

  on('classic.SubagentStart', async ($, e, next) => {
    const result = await next(e)
    return { ...result, additionalContext: [...(result.additionalContext ?? []), SUBAGENT_CONTEXT] }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const session = await $.session.id()
    const isWindows = /^([A-Za-z]:|\\\\)/.test(await $.session.cwd())
    const paths: unknown = (e as { paths?: unknown }).paths
    const lines: string[] = []
    for (const path of Array.isArray(paths) ? paths : []) {
      const reason = typeof path === 'string' ? rejection(path, isWindows) : 'not a string'
      if (reason) {
        lines.push(`not registered (${reason}): ${String(path)}`)
        continue
      }
      try {
        await $.store.set(`${session}\n${path}`, true)
        lines.push(`registered: ${path}`)
      } catch {
        lines.push(`not registered (store refused it): ${path}`)
      }
    }
    return { result: lines.length > 0 ? lines.join('\n') : 'No paths given.' }
  })

  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    if (e.stop_hook_active || (e.background_tasks?.length ?? 0) > 0) return result
    const prefix = `${e.session_id}\n`
    const present: string[] = []
    for (const key of await $.store.keys()) {
      if (!key.startsWith(prefix)) continue
      const path = key.slice(prefix.length)
      await $.store.delete(key)
      if (await $.fs.exists(path)) present.push(path)
    }
    if (present.length === 0) return result
    return { ...result, additionalContext: [...(result.additionalContext ?? []), cleanupText(present)] }
  })
}
