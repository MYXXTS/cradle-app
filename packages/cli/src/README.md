<!-- Once this directory changes, update this README.md -->

# CLI Source

Runtime and generated command source for the Cradle CLI.

## Files

- **index.ts**: Root `cradle` executable entry point; resolves the target server from `--server`, `CRADLE_SERVER_URL`, Desktop server locator, then the default local port; registers generated commands and manual long-running workflows including `plugin dev`
- **runtime/**: Stable command runtime helpers
- **commands/**: Generated command modules, manual task-shaped wrappers, and registration barrel
