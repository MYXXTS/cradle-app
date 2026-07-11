<!-- Once this directory changes, update this README.md -->

# scripts

`apps/web/scripts` owns package-local development and CI workflow commands. Scripts in this directory are invoked through `pnpm --filter @cradle/web ...` so their working directory is the web package root.

## Directories

- **i18n-workflow/**: Translation resource generation, validation, report creation, and cleanup commands for the Cradle web i18n architecture.

## Commands

- **check-api-gen-boundaries.ts**: Rejects direct generated-client imports in migrated feature files, fails when the non-gateway direct-import baseline grows, and rejects new raw `fetch()` call sites unless they are exact reviewed streaming/binary/external/transport exceptions. Set `CRADLE_API_BOUNDARY_DEBUG=1` to print the remaining raw-fetch inventory. It runs as part of `pnpm --filter @cradle/web typecheck`.
