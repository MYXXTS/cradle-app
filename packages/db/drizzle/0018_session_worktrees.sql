CREATE TABLE `worktrees` (
	`id` text PRIMARY KEY NOT NULL,
	`source_workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`branch` text NOT NULL,
	`base_ref` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_session_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `worktrees_source_workspace_id_idx` ON `worktrees` (`source_workspace_id`);--> statement-breakpoint
CREATE INDEX `worktrees_status_idx` ON `worktrees` (`status`);--> statement-breakpoint
CREATE INDEX `worktrees_source_workspace_name_idx` ON `worktrees` (`source_workspace_id`,`name`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `worktree_id` text REFERENCES worktrees(id);--> statement-breakpoint
ALTER TABLE `sessions` ADD `pending_worktree_id` text REFERENCES worktrees(id);--> statement-breakpoint
CREATE INDEX `sessions_worktree_id_idx` ON `sessions` (`worktree_id`);--> statement-breakpoint
CREATE INDEX `sessions_pending_worktree_id_idx` ON `sessions` (`pending_worktree_id`);
