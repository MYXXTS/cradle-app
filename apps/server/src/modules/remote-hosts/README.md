# remote-hosts

Owns Cradle's registry of remote Cradle Server instances. A remote host row stores how the local Cradle Server reaches another Cradle Server through a direct HTTP(S) base URL, an SSH local port tunnel, or a relay transport tunnel through relayd for machines without inbound network reachability.

Rows live in `remote_hosts`. The remote host module owns connection lifecycle, health probing, and proxying selected remote Cradle Server APIs. It must not write remote server identity into provider target namespaces.

## Files

- `index.ts`: Elysia route surface under `/remote-hosts`, including host CRUD, `/cradle-server/connect`, `/cradle-server/disconnect`, `/cradle-server/health`, `/relay/claim`, and remote workspace file proxy routes.
- `model.ts`: TypeBox request and response schemas for remote host config, relay claim input, remote Cradle Server health, workspace list, and file proxy responses.
- `service.ts`: Drizzle-backed host registry, SSH/direct URL/relay connection lifecycle, relay pairing claim, health checks, and remote workspace proxy functions.
- `remote-cradle-client.ts`: Small HTTP client for calling the target Cradle Server's existing `/health` and `/workspaces` APIs.
- `cradle-server-tunnel.ts`: OpenSSH local TCP port-forwarding helper for reaching a target Cradle Server through an SSH profile.

## Connection Config

A direct URL host uses:

    {
      "transport": "direct-url",
      "baseUrl": "http://127.0.0.1:21423"
    }

An SSH host uses:

    {
      "transport": "ssh",
      "ssh": {
        "hostName": "devbox.local",
        "user": "wibus",
        "port": 22,
        "auth": "default"
      }
    }

A relay host starts with relay location but no pinned keys:

    {
      "transport": "relay",
      "relay": {
        "relayUrl": "https://relay.example.com"
      }
    }

or with a registry row owned by `relay-servers`:

    {
      "transport": "relay",
      "relay": {
        "relayServerId": "public-vps"
      }
    }

After `POST /remote-hosts/:hostId/relay/claim` succeeds, `service.ts` stores the
stable `roomId`, `pinnedHostPubkey`, and `controllerKeyRef` under the same
`relay` object. Future `POST /remote-hosts/:hostId/cradle-server/connect` calls
use those pinned values and do not require the pairing string again.

`controllerKeyRef` is the controller X25519 encryption key. The controller
Ed25519 relay assertion signing key is stored separately as the sibling secret
`relay-controller-sign-key:{hostId}` and is derived from no shared relayd secret.

The Cradle Server capability controls where the SSH tunnel connects after reaching the target machine:

    {
      "cradleServer": {
        "enabled": true,
        "remoteHost": "127.0.0.1",
        "remotePort": 21423
      }
    }

For relay transport, the host-side connector always bridges to the host server's
own configured local HTTP port. The controller still receives a local
`localBaseUrl`, so `RemoteCradleClient` and workspace proxy routes do not need a
separate relay code path.

## Ownership Boundary

This module deliberately does not define a second remote agent protocol. The target Cradle Server already owns workspace, session, runtime, provider, and file semantics. Local Cradle connects to that server and calls its HTTP APIs. If a new remote capability is needed, add it to the owning target Cradle Server module first, then proxy it here only when the local product needs that projection.
