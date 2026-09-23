# CYS (Clean Your Shit)

When the CYS hook supplies a registration command, register each task-created temporary file or directory by its absolute path. Wait for subagents and external models to report their paths. Resolve each registered path after deleting it or deciding to retain it.

Before your final response on a task that created temporary files, check the scratch or work location supplied by the active environment and any other temporary paths used by subagents or external models you invoked. Delete task-created files and directories once they are no longer needed. Preserve pre-existing, user-authored, tracked, and still-needed files. If you keep an intermediate, report its path and why.
