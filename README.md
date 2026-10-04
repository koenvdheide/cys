# CYS (Clean Your Shit)

CYS asks Claude Code to clean up temporary files at Stop. An agent registers the exact path of each temporary file or directory it creates. If any registered paths still exist at Stop, CYS asks the agent for one cleanup pass. CYS never deletes files itself.

Subagents and external models can register their paths in the same session. Paths can be in a workspace or an operating system temporary directory.

## Install

CYS runs as a Claude Code mod and needs Claude Code v2.1.287 or later. It is listed in the [agent-tools](https://github.com/koenvdheide/agent-tools) marketplace:

```sh
claude plugin marketplace add koenvdheide/agent-tools
claude plugin install cys@agent-tools
```

When upgrading from 0.1.0, which ran Python command hooks, remove any earlier CYS entries from `~/.claude/settings.json`. Registrations made by 0.1.0 are not carried over.

## Use

The agent registers each temporary path with the `mcp__cys__register` tool, using the machine's native absolute form (`C:\...` on Windows, `/...` elsewhere). Subagents that have the tool use it; the others list their paths in their final report, and the main agent registers them. Registrations are kept in the plugin's store, so a session resumed with `claude --resume` still finds them; `--fork-session` and `/branch` start with none.

At a Stop that is neither a cleanup continuation nor waiting on background tasks, CYS lists, once, every registered path that is still on disk or whose existence it could not check, and forgets every registration of that session. Registering a path again re-arms it.

The agent must preserve pre-existing, user-authored, tracked, and still-needed files. If it keeps an intermediate, it reports the path and reason.

## Check

```sh
claude plugin test .
claude plugin validate . --strict
```
