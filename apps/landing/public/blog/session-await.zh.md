---
title: Session Await：让 Agent 学会等待
date: 2026-07-10
cover: /blog/covers/session-await.svg
description: Agent 推完 PR 之后在等 CI——但你不必陪着等。Session Await 让会话挂起在条件上，条件满足时自动继续。
---

> Your agent pushed a PR. It's waiting for CI. You don't have to be.

软件工作里有一种隐形的浪费：等待。等 CI 跑完，等 review 通过，等一个文件发生变化。这些等待本身不占算力，却牢牢占着人的注意力——你不敢走远，因为"可能马上就好了"。

Session Await 想把这部分注意力还给你。

## 把等待变成一个条件

在 Cradle 里，你可以给会话设置一个条件：CI 通过、review 被批准、某个文件变化。条件设好之后，Cradle 会挂起这个会话——不是结束它，而是让它睡着。

当条件触发时，agent 从它停下的地方精确地继续。上下文还在，目标还在，进度还在。

## 合上电脑，工作继续

这意味着你可以真正地离开。合上电脑，去开会，去睡觉。Cradle 会在条件满足时恢复会话、汇报结果、推进下一步——不需要任何人盯着。

这件事的意义不在于自动化本身，而在于**注意力的解耦**。Agent 的工作节奏是事件驱动的，人的节奏不是。Session Await 让这两种节奏各自独立：agent 等它的事件，你过你的生活。

## 等待也是工作的一部分

我们越来越相信，一个好的 agent 运行环境，不是让 agent 跑得更快，而是让它**在该停的时候停得得体**。执行、等待、恢复、汇报——这是一条完整的生命周期，而等待正是其中最被低估的一环。
