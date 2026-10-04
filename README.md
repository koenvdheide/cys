# CYS (Clean Your Shit)

Claude Code leaves scratch files behind as it works: probe scripts, captured output, intermediate data. CYS keeps track of them. Claude registers each temporary file it creates, and at the end of the turn CYS asks it to clean up the registered files that are still there. CYS never deletes anything itself.

## Install

Needs Claude Code v2.1.287 or later.

```sh
claude plugin marketplace add koenvdheide/agent-tools
claude plugin install cys@agent-tools
```

## Development

```sh
claude plugin test .
claude plugin validate . --strict
```
