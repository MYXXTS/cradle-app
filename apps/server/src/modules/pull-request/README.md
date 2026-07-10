# Pull Request Module

Owns session-bound GitHub pull request lifecycle for isolated agent work:

1. Push the isolated worktree branch
2. Open a **draft** PR on GitHub
3. Persist PR linkage on `sessions.configJson.github.pullRequest`
4. Refresh status and mark ready for review

The module also owns read-only delivery readiness (`baseRef..HEAD`, cleanliness,
changed files) and updating an existing open PR after pushing follow-up commits.
The Work module composes these APIs but does not duplicate Git or GitHub logic.

Branch push policy for create/update delivery:

- First publish of a missing remote branch uses an ordinary `--set-upstream` push.
- When the remote tip already exists, push uses `--force-with-lease=<branch>:<observedSha>`
  so local amend/rebase can republish Cradle-managed worktree branches without a
  bare `--force`. If the remote tip moved after inspection, push fails with
  `git_push_lease_rejected` instead of overwriting blindly.

Does **not** own merge, CI awaits, or Diff Review sync. Waiting for CI remains a user/agent decision via `session await`.

## Routes

| Method | Path | CLI | Notes |
|--------|------|-----|-------|
| `GET` | `/sessions/:id/pull-request` | `session pull-request get` | Bound PR + live refresh; CLI defaults session id from `CRADLE_CHAT_SESSION_ID` |
| `POST` | `/sessions/:id/pull-request` | `session pull-request create` | Requires isolation; always draft; CLI defaults session id from `CRADLE_CHAT_SESSION_ID` |
| `POST` | `/sessions/:id/pull-request/ready` | `session pull-request ready` | Converts draft → ready; CLI defaults session id from `CRADLE_CHAT_SESSION_ID` |

Ready-for-review uses GitHub's GraphQL `markPullRequestReadyForReview` mutation;
the REST pull-request update endpoint does not transition Draft PR state. GitHub
requests have a bounded timeout so callers receive an actionable failure instead
of remaining pending indefinitely.

## Files

- **index.ts**: Elysia routes under `/sessions/:id/pull-request*` with `x-cradle-cli` metadata.
- **model.ts**: TypeBox request/response schemas.
- **service.ts**: Isolation/readiness checks, remote resolution, push, GitHub create/update/ready, `configJson` persistence.
- **delivery-push.ts**: First-publish vs force-with-lease push arg selection for managed branches.
- **github-remote.ts**: Parse `owner/repo` from GitHub HTTPS/SSH remote URLs.
