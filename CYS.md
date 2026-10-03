# CYS (Clean Your Shit)

Register each task-created temporary file or directory by its absolute path: on Claude Code with the `mcp__cys__register` tool, on Codex with the registration command the CYS hook supplies. Subagents register or report their paths to the main agent, which collects paths from subagents and external models before cleanup. On Codex, resolve each registered path after deleting it or deciding to retain it.

The main agent handles cleanup at the end of the turn, when the Stop hook requests it. Check the scratch or work location supplied by the active environment and any other temporary paths used by subagents or external models you invoked. Delete task-created files and directories once they are no longer needed. Preserve pre-existing, user-authored, tracked, and still-needed files. If you keep an intermediate, report its path and why.
