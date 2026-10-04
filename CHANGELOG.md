# Changelog

All notable changes to CYS will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-04

### Changed

- Rewritten as a Claude Code mod. A native `mcp__cys__register` tool replaces the shell command the agent ran to register each path, so the plugin no longer needs Python.
- Registrations are kept in the plugin's store, keyed by session, so a resumed session still finds them. A Stop that lists them forgets them, and registering a path again re-arms it; the separate `resolve` step is gone.
- Paths must be absolute in the machine's native form. On Windows, a Git Bash path such as `/c/Users/x` is refused with a reason naming the `C:\...` form.
- The Codex hooks moved to a separate plugin.

## [0.1.0] - 2026-09-24

### Added

- Python command hooks for Claude Code and Codex: SessionStart and SubagentStart supply `add` and `resolve` commands, and Stop asks once for cleanup of registered paths still on disk.
