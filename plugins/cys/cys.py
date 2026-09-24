"""CYS: register temporary paths and ask for one cleanup pass at Stop."""

import hashlib
import json
import os
import shlex
import sqlite3
from contextlib import closing
from pathlib import Path
import stat
import sys
import tempfile


STATE = Path(tempfile.gettempdir()) / f"cys-{os.getuid() if hasattr(os, 'getuid') else 'user'}"
CREATE_TABLE = "CREATE TABLE IF NOT EXISTS entries (path TEXT PRIMARY KEY, prompted INTEGER NOT NULL DEFAULT 0)"


def record(host, session, state=None):
    key = hashlib.sha256(f"{host}:{session}".encode()).hexdigest()
    return Path(STATE if state is None else state) / f"{key}.sqlite3"


def prepare_state(state):
    state.mkdir(mode=0o700 if os.name != "nt" else 0o777, exist_ok=True)
    if state.is_symlink() or not stat.S_ISDIR(state.stat().st_mode):
        raise RuntimeError("CYS state directory is not a real directory")
    if hasattr(os, "getuid"):
        info = state.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise RuntimeError("CYS state directory is not private")


def update(path, action, name):
    if action == "resolve" and not path.exists():
        return
    if action == "add":
        prepare_state(path.parent)
    with closing(sqlite3.connect(path, timeout=10, isolation_level=None)) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            db.execute(CREATE_TABLE)
            if action == "add":
                db.execute("INSERT INTO entries (path, prompted) VALUES (?, 0) ON CONFLICT(path) DO NOTHING", (name,))
            else:
                db.execute("DELETE FROM entries WHERE path=?", (name,))
            db.commit()
        except Exception:
            db.rollback()
            raise


def pending_for_stop(path):
    if not path.exists():
        return []
    with closing(sqlite3.connect(path, timeout=10, isolation_level=None)) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            db.execute(CREATE_TABLE)
            pending = [name for (name,) in db.execute("SELECT path FROM entries WHERE prompted=0")
                       if os.path.lexists(name)]
            if pending:
                db.executemany("UPDATE entries SET prompted=1 WHERE path=?", ((name,) for name in pending))
            db.commit()
        except Exception:
            db.rollback()
            raise
    return sorted(pending)


def remove_record(path):
    path.unlink(missing_ok=True)
    path.with_name(path.name + "-journal").unlink(missing_ok=True)


def command_for(host, session, action):
    args = [sys.executable, str(Path(__file__).resolve()), action, host, session, str(STATE)]
    if os.name == "nt":
        args = [value.replace("\\", "/") for value in args]
        powershell = "& " + " ".join("'" + value.replace("'", "''") + "'" for value in args)
        cmd = " ".join('"' + value + '"' for value in args)
        return f"PowerShell: `{powershell} PATH`; CMD: `{cmd} PATH`; Bash: `{shlex.join(args)} PATH`"
    return f"`{shlex.join(args)} PATH`"


def hook(host):
    event = json.load(sys.stdin)
    session = event.get("session_id")
    name = event.get("hook_event_name")
    if not session:
        return

    if name in ("SessionStart", "SubagentStart"):
        context = (
            "CYS: After creating a temporary file or directory, register its exact absolute "
            f"path with {command_for(host, session, 'add')}. "
            "Replace PATH with one shell-quoted absolute path; use that exact path when resolving. "
            "Include paths made by subagents and external model tools; share these exact commands "
            "if they register directly. Wait for their reports before finishing. "
            "Delete temporary "
            "files no longer needed and run "
            f"{command_for(host, session, 'resolve')} for each removed path. "
            "If retaining a path, report its location and reason, then resolve it. "
            "Do not register deliverables or pre-existing files."
        )
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": name, "additionalContext": context}}))
        return

    path = record(host, session)
    if name == "SessionEnd":
        remove_record(path)
        return
    if name != "Stop":
        return

    pending = pending_for_stop(path)
    if not pending:
        print("{}")
        return

    listed = "\n".join(pending)
    reason = (
        "CYS has registered temporary paths still present:\n" + listed +
        "\nReview ownership and whether each is still needed. Delete only task-created "
        "disposable paths; preserve user, pre-existing, tracked, and needed files. "
        "For every path, run the CYS resolve command supplied at session start "
        "after deleting it or explicitly retaining and reporting it. Do this cleanup pass "
        "once, then finish."
    )
    print(json.dumps({"decision": "block", "reason": reason}))


def main():
    action, host, *args = sys.argv[1:]
    if host not in ("codex", "claude"):
        raise SystemExit("host must be codex or claude")
    if action == "hook":
        hook(host)
        return
    if action not in ("add", "resolve") or len(args) not in (2, 3):
        raise SystemExit("usage: cys.py add|resolve HOST SESSION [STATE_DIR] ABSOLUTE_PATH")
    session, *paths = args
    state, name = (STATE, paths[0]) if len(paths) == 1 else paths
    if not session or not os.path.isabs(state) or not os.path.isabs(name):
        raise SystemExit("session, state directory, and path must be absolute")
    update(record(host, session, state), action, name)


if __name__ == "__main__":
    main()
