---
title: Run four agents on the same codebase. At the same time.
date: 2026-07-06
cover: /blog/covers/multi-agent.svg
description: Love Claude Code? Run four of them. Cradle orchestrates every agent as a parallel worker — each with its own task, kanban card, and live status, none of them tripping over each other.
---

> Run four agents on the same codebase. At the same time.

A single agent can already write code. So where's the bottleneck? You. You can only watch one session at a time — wait for it to finish, then hand out the next task. Agent throughput is concurrent; human scheduling is serial.

Cradle's multi-agent orchestration exists to remove exactly that bottleneck.

## Every agent is a parallel worker

In Cradle, each agent is an independent worker: its own task, its own kanban card, its own live status. You can run four Claude Codes at once, or assign different jobs to different runtimes — one surface, every runner moving at once.

The key is that they don't trip over each other. Cradle uses worktrees for session-level isolation: every task lives in its own working tree, with cleanup policies (max count / max disk usage) that reclaim them automatically. Parallelism stops being "open four terminals and pray" and becomes a managed state.

## The orchestrator's view

Once the workers multiply, what you need isn't a chat box — it's a control tower.

The kanban shows you which column every task is in and where it's stuck. Session states — running, waiting, blocked — are a unified language. Any surface — Chat, Workspace, Diffs, Kanban — can be torn off into a standalone window and placed wherever it suits you.

Your role changes too: no longer the person pacing next to a single session, but the one dispatching work, watching for exceptions, and making the calls.

## Why not just "open four terminals"

Because the real cost of parallelism isn't starting — it's **tracking**. Four terminals give you 4× the output and 4× the mental overhead. What Cradle does is translate "happening at once" into "readable at a glance": status, progress, isolation, cleanup — all with one consistent expression.

Agent parallelism is cheap. Human attention is expensive. Good orchestration spends the first to save the second.
