# Privacy

CYS stores one thing: the paths Claude registers with its `register` tool.

They live in the plugin's store under `~/.claude/plugins/store/`, keyed by session id and a hash of the path. At the end of a turn CYS checks which of the session's paths still exist, lists those in Claude's context, and deletes the session's entries. Entries from a session that ends earlier remain: CYS sets no expiry, and Claude Code clears a plugin's store only after it goes unused for `cleanupPeriodDays`.

CYS reads no file contents, deletes no files and makes no network requests.
