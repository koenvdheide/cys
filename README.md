# CYS (Clean Your Shit)

CYS is a small Stop hook for Codex and Claude Code. An agent registers each temporary path it creates. At Stop, CYS asks for one cleanup pass only when registered paths still exist. The agent decides what to delete; CYS never deletes task files itself.

The same record can include paths created by subagents and external models. Registration uses exact absolute paths, so scratch files can live in the workspace, `C:\tmp`, `/tmp`, or the macOS temporary directory.

## Install

Put `cys.py` at a stable path and make Python 3 with `sqlite3` available to the hook command. Merge the following entries into your existing hooks configuration. Replace the script path and use `python` instead of `python3` if that is your Python command. On Windows, forward slashes in the script path work in both configuration files.

For Codex, add to `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "python3 \"/absolute/path/to/cys.py\" hook codex"}]}],
    "SubagentStart": [{"hooks": [{"type": "command", "command": "python3 \"/absolute/path/to/cys.py\" hook codex"}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "python3 \"/absolute/path/to/cys.py\" hook codex"}]}],
    "SessionEnd": [{"hooks": [{"type": "command", "command": "python3 \"/absolute/path/to/cys.py\" hook codex"}]}]
  }
}
```

For Claude Code, add the same entries to `~/.claude/settings.json`, changing `hook codex` to `hook claude`. Keep any hooks already in either file. In Codex, review and trust the new commands with `/hooks`; Codex skips untrusted user hooks. Claude Code also applies its workspace trust controls. [Codex hooks](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks) · [Claude Code hooks](https://code.claude.com/docs/en/hooks)

The start hook gives the agent exact `add` and `resolve` commands using the hook's Python interpreter and state directory. On Windows, Claude Code receives both PowerShell and Bash forms; use the one matching the agent's shell. After creating a temporary file or directory, the agent runs `add` with its absolute path. After deleting it, or explicitly choosing to retain and report it, the agent runs `resolve`. Stop prompts once for each registered path that still exists. SessionEnd removes the per-session SQLite record; the shared state directory remains empty for reuse.

## Check

From the repository directory, run:

```sh
python3 -B -m unittest discover -s . -p 'test_cys.py'
```
