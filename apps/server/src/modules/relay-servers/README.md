# Relay Servers

This module owns Cradle's relay server registry.

Relay server rows are Cradle application data stored in `relay_servers`. A row names a relay URL,
whether it is enabled, and whether it is the default relay used by remote host pairing when
the request does not specify a relay server id.

Only this module writes the relay server registry. Other modules may read it to resolve relay URLs,
but they should not duplicate default-selection or managed relayd lifecycle semantics.

relayd admission does not use a shared secret. Hosts and controllers present Ed25519-signed
relay assertions to relayd; relayd verifies the signature, assertion freshness, and nonce replay,
then authorizes the request against in-memory room public-key state.

## Built-in Local Relayd

`local-relayd-supervisor.ts` owns the local relayd process launched by Cradle Server.
It is a convenience for desktop/dev use:

- `CRADLE_RELAYD_AUTOSTART=0|false|no` disables it.
- `CRADLE_RELAYD_AUTOSTART=1|true|yes` forces it on.
- Without an explicit value, it starts outside `test` and `production`.
- `CRADLE_RELAYD_PATH` points at an explicit relayd executable.
- Packaged Desktop resolves `process.resourcesPath/relayd/<platform>-<arch>/relayd`.
- Dev source trees fall back to `go run ./cmd/relayd` from `apps/relayd`.

The supervisor keeps an owner stdin pipe open and starts relayd with
`CRADLE_RELAYD_EXIT_ON_STDIN_CLOSE=1`. This lets relayd shut itself down if Cradle
Server exits unexpectedly, including the `go run` development path where the actual
relayd listener is a child of the Go wrapper process.

When the managed relayd is ready, the supervisor upserts the system row
`system:local-relayd` with display name `Built-in local relay`. It becomes default only when no
explicit default exists, so user-selected public relay servers remain authoritative.

Desktop users configure whether this managed relay only listens on localhost or accepts
connections from other devices through Settings > Network > Inbound access. The setting is stored
in `preferences/network.json` and is read on the next Cradle restart. Environment variables still
override this for development/deployment:

- `CRADLE_RELAYD_LISTEN` sets the child relayd listen address directly.
- `CRADLE_RELAYD_PUBLIC_URL` sets the relay URL advertised into the `system:local-relayd` row.

The supervisor does not inject credentials into the child process. A self-hosted relayd also does
not require a configured shared secret; optional relayd configuration is limited to listener,
timeouts, queue limits, metrics, and pairing rate limits.

relayd supports `POST /rooms/host-session` so a host connector can idempotently recreate or renew
its room after relayd restarts or an idle room expires. The host signs that request with its
persisted Ed25519 signing key and includes the controller signing public key learned during pairing,
allowing relayd to restore controller WebSocket authorization without persistent relayd storage.

## Routes

- `GET /relay-servers`: list relay servers.
- `POST /relay-servers`: create a relay server.
- `PATCH /relay-servers/:relayServerId`: update a relay server.
- `DELETE /relay-servers/:relayServerId`: delete a relay server.

All routes include `x-cradle-cli` metadata under the `relay-server` command namespace.
