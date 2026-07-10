# Work feature

This feature owns the web projection of a local Work container: Work queries,
the Work-owned conversation surface, header/sidebar chrome, and the Right Aside
handoff/delivery panel.

Work reuses the primary Session conversation renderer. It does not fork Chat
Runtime state or create a second stream owner. Preparing is local-only; Draft PR
creation/update occurs only from an explicit user submit action.
