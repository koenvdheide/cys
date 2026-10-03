"""Focused regression checks for CYS Stop and session state."""

import json
import os
import sqlite3
import shutil
import subprocess
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from plugins.cys import cys


class CysTests(unittest.TestCase):
    def setUp(self):
        work = Path(__file__).parent / "work"
        work.mkdir(exist_ok=True)
        self.root = work / f"cys-test-{uuid4().hex}"
        self.root.mkdir()
        self.addCleanup(shutil.rmtree, self.root)
        self.state = self.root / "state"
        self.state.mkdir(mode=0o700 if os.name != "nt" else 0o777)
        state_patch = patch.object(cys, "STATE", self.state)
        state_patch.start()
        self.addCleanup(state_patch.stop)
        self.record = cys.record("session")
        self.created = self.root / "created.txt"
        self.created.touch()

    def test_codex_defers_new_paths_until_next_regular_stop(self):
        cys.update(self.record, "add", str(self.created))
        output = StringIO()
        event = {"session_id": "session", "hook_event_name": "Stop", "stop_hook_active": True}
        with patch("sys.stdin", StringIO(json.dumps(event))), redirect_stdout(output):
            cys.hook()
        self.assertEqual(json.loads(output.getvalue()), {})
        event["stop_hook_active"] = False
        output = StringIO()
        with patch("sys.stdin", StringIO(json.dumps(event))), redirect_stdout(output):
            cys.hook()
        self.assertEqual(json.loads(output.getvalue())["decision"], "block")
        self.assertIn(str(self.created), json.loads(output.getvalue())["reason"])
        self.assertEqual(cys.pending_for_stop(self.record), [])

    def test_duplicate_registration_does_not_rearm_prompt(self):
        cys.update(self.record, "add", str(self.created))
        self.assertEqual(cys.pending_for_stop(self.record), [str(self.created)])
        cys.update(self.record, "add", str(self.created))
        self.assertEqual(cys.pending_for_stop(self.record), [])
        cys.update(self.record, "resolve", str(self.created))
        cys.update(self.record, "add", str(self.created))
        self.assertEqual(cys.pending_for_stop(self.record), [str(self.created)])

    def test_stop_handles_database_before_first_table_creation(self):
        sqlite3.connect(self.record).close()
        self.assertEqual(cys.pending_for_stop(self.record), [])

    def test_first_registration_creates_a_usable_state_directory(self):
        self.state.rmdir()
        cys.update(self.record, "add", str(self.created))
        self.assertEqual(cys.pending_for_stop(self.record), [str(self.created)])

    def test_ending_one_session_keeps_shared_state_available(self):
        cys.update(self.record, "add", str(self.created))
        cys.remove_record(self.record)
        self.assertTrue(cys.STATE.is_dir())

    def test_registration_command_uses_running_python_and_selected_state(self):
        command = cys.command_for("session", "add")
        self.assertIn(sys.executable.replace("\\", "/"), command)
        self.assertIn(str(self.state).replace("\\", "/"), command)

    def test_registration_uses_explicit_state_when_temp_environment_changes(self):
        with patch.object(cys, "STATE", self.root / "different-temp"):
            argv = ["cys.py", "add", "codex", "session", str(self.state), str(self.created)]
            with patch.object(sys, "argv", argv):
                cys.main()
        self.assertEqual(cys.pending_for_stop(self.record), [str(self.created)])

    def test_record_name_keeps_codex_prefix(self):
        import hashlib
        expected = hashlib.sha256(b"codex:session").hexdigest() + ".sqlite3"
        self.assertEqual(cys.record("session").name, expected)

    def test_cli_rejects_other_hosts(self):
        with patch.object(sys, "argv", ["cys.py", "add", "claude", "session", str(self.state), str(self.created)]):
            with self.assertRaises(SystemExit) as raised:
                cys.main()
        self.assertEqual(str(raised.exception), "host must be codex")

    @unittest.skipUnless(os.name == "nt", "PowerShell quoting applies on Windows")
    def test_powershell_command_handles_apostrophe_in_script_path(self):
        powershell = shutil.which("pwsh") or shutil.which("powershell")
        if not powershell:
            self.skipTest("PowerShell is unavailable")
        script_dir = self.root / "O'Brien"
        script_dir.mkdir()
        script = script_dir / "cys.py"
        shutil.copyfile(cys.__file__, script)
        with patch.object(cys, "__file__", str(script)):
            command = cys.command_for("session", "add")
        powershell_command = command.split("PowerShell: `", 1)[1].split("`", 1)[0]
        path_arg = "'" + str(self.created).replace("'", "''") + "'"
        completed = subprocess.run(
            [powershell, "-NoProfile", "-Command", powershell_command.replace("PATH", path_arg)],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(cys.pending_for_stop(cys.record("session", self.state)), [str(self.created)])

    @unittest.skipUnless(os.name == "nt", "CMD quoting applies on Windows")
    def test_codex_cmd_command_handles_spaces_and_apostrophes(self):
        script_dir = self.root / "O'Brien with spaces"
        script_dir.mkdir()
        script = script_dir / "cys.py"
        shutil.copyfile(cys.__file__, script)
        with patch.object(cys, "__file__", str(script)):
            command = cys.command_for("session", "add")
        cmd_command = command.split("CMD: `", 1)[1].split("`", 1)[0]
        path_arg = '"' + str(self.created).replace("\\", "/") + '"'
        completed = subprocess.run(
            cmd_command.replace("PATH", path_arg),
            shell=True, capture_output=True, text=True, check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(cys.pending_for_stop(cys.record("session", self.state)), [str(self.created).replace("\\", "/")])


if __name__ == "__main__":
    unittest.main()
