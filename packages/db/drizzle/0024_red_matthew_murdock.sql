CREATE TABLE `session_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`linked_issue_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `session_groups_workspace_id_idx` ON `session_groups` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `session_groups_linked_issue_id_idx` ON `session_groups` (`linked_issue_id`);--> statement-breakpoint
CREATE INDEX `session_groups_archived_at_idx` ON `session_groups` (`archived_at`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `session_group_id` text REFERENCES session_groups(id);--> statement-breakpoint
CREATE INDEX `sessions_session_group_id_idx` ON `sessions` (`session_group_id`);