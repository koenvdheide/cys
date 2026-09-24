# CYS (Clean Your Shit)

CYS asks Codex or Claude Code to clean up temporary files at Stop. An agent registers the exact path of each temporary file or directory it creates. If any registered paths still exist at Stop, CYS asks the agent for one cleanup pass. CYS never deletes files itself.

Subagents and external models can register their paths in the same session. Paths can be in a workspace or an operating system temporary directory.

## Install

Python 3 with `sqlite3` must be available as `python3` on the hook's PATH. Install one or both plugins:

```sh
codex plugin marketplace add koenvdheide/cys
codex plugin add cys@cys

claude plugin marketplace add koenvdheide/cys
claude plugin install cys@cys
```

The GitHub marketplace becomes available after this repository is published. For a local checkout, replace `koenvdheide/cys` with its directory path. Codex requires hook review through `/hooks`; trust the plugin hook before removing earlier CYS entries from `~/.codex/hooks.json`. Remove earlier CYS entries from `~/.claude/settings.json` after installing the Claude plugin to avoid running it twice.

## Use

The SessionStart hook supplies exact `add` and `resolve` commands. On Windows, use the form for the active shell: PowerShell, CMD, or Bash. After creating a temporary file or directory, run `add` with its absolute path. After deleting it, or deciding to retain and report it, run `resolve`. At Stop, CYS prompts once for registered paths that still exist. SessionEnd removes the session record.

The agent must preserve pre-existing, user-authored, tracked, and still-needed files. If it keeps an intermediate, it reports the path and reason.

## Check

```sh
python3 -B -m unittest discover -s . -p 'test_cys.py'
claude plugin validate . --strict
claude plugin validate plugins/cys --strict
```
