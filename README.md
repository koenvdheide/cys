# CYS

Claude Code leaves scratch files behind as it works: probe scripts, captured output, intermediate data. CYS gives Claude a `register` tool for those files, and answers calls to that tool itself; it intercepts no other tool. At the end of each turn it lists the registered files that still exist and asks Claude to clean them up. CYS never deletes anything itself.

Subagents register their own files or report them to the main agent. Registrations stay in the plugin's own store, and CYS makes no network calls; see [PRIVACY.md](PRIVACY.md).

## Examples

- Ask Claude for a second opinion from another model's CLI. The prompt, answer and log files it writes are listed at the end of the turn, and Claude deletes them.
- Ask Claude why CI fails only on Linux. The scratch copy of the project it tests in a container is listed at the end of the turn, and Claude deletes it.
- Ask Claude to split a task across subagents. Their brief and report files are cleaned up the same way. A file registered by mistake also shows up in the list; Claude keeps it and says why.

## Install

Needs Claude Code v2.1.287 or later.

```sh
claude plugin marketplace add koenvdheide/agent-tools
claude plugin install cys@agent-tools
```

## Troubleshooting

- Nothing gets registered: check that `/plugin` lists `cys` as an active mod.
- A path comes back "not registered": the message gives the reason. Paths must be absolute in the machine's native form (`C:\...` on Windows).
- No cleanup request: CYS waits until running background tasks finish.

Report problems at [github.com/koenvdheide/cys/issues](https://github.com/koenvdheide/cys/issues).

## Development

```sh
claude plugin test .
claude plugin validate . --strict
```
