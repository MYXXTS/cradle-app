CREATE TABLE `work_threads` (
	`session_id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `work_threads_work_id_idx` ON `work_threads` (`work_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `work_threads_primary_work_unique` ON `work_threads` (`work_id`) WHERE "work_threads"."role" = 'primary';--> statement-breakpoint
CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`objective` text NOT NULL,
	`linked_issue_id` text,
	`handoff_title` text,
	`handoff_summary` text,
	`handoff_test_plan` text,
	`prepared_at` integer,
	`last_submitted_at` integer,
	`closed_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`linked_issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `works_linked_issue_id_idx` ON `works` (`linked_issue_id`);--> statement-breakpoint
CREATE INDEX `works_archived_at_idx` ON `works` (`archived_at`);--> statement-breakpoint
CREATE INDEX `works_updated_at_idx` ON `works` (`updated_at`);