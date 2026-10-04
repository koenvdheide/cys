# CYS (Clean Your Shit)

Claude Code leaves scratch files behind as it works: probe scripts, captured command output, prompts and results for external reviewers, intermediate JSON. Nothing prompts it to remove them, so they pile up in your temp directory and sometimes in your project.

CYS is a Claude Code mod that keeps track of those files. Claude registers each temporary file or directory it creates, and at the end of each turn CYS hands Claude the registered paths that are still there and asks for one cleanup pass. CYS never deletes anything itself. Claude decides what to remove, and the cleanup request asks it to keep anything user-authored, tracked or still needed and to report what it kept and why.

## Install

CYS needs Claude Code v2.1.287 or later. It is listed in the [agent-tools](https://github.com/koenvdheide/agent-tools) marketplace:

```sh
claude plugin marketplace add koenvdheide/agent-tools
claude plugin install cys@agent-tools
```

Then run `/reload-plugins` in an open session, or restart Claude Code.

If you used CYS 0.1.0, which ran Python hooks, remove its entries from `~/.claude/settings.json`. Files registered under 0.1.0 are not carried over.

## How it works

- CYS gives Claude a tool, `register`, which it calls with the absolute path of each temporary file or directory right after creating it. Paths must be in the machine's native form (`C:\...` on Windows); a Git Bash path such as `/c/Users/...` is refused with a message naming the native form.
- Subagents that have the tool register their own files. Subagents without it list their files in their final report, and the main agent registers them.
- When a turn ends, CYS gives Claude the session's registered paths that still exist (and any it could not check) as a list to review. Each registration is listed once; registering the same path again puts it back on the list.
- CYS waits while a cleanup pass or a background task is still running, and stays out of the way if another hook has stopped the session.
- Registrations are stored per session, so they survive `claude --resume`. A forked session (`--fork-session` or `/branch`) starts with none.

## Development

```sh
claude plugin test .
claude plugin validate . --strict
```
