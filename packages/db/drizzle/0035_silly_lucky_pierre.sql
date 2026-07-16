CREATE TABLE `external_session_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`source_host_id` text NOT NULL,
	`source_app` text NOT NULL,
	`external_session_id` text NOT NULL,
	`source_path` text,
	`source_workspace_path` text NOT NULL,
	`source_revision` text NOT NULL,
	`content_hash` text NOT NULL,
	`source_git_identity_json` text DEFAULT '{}' NOT NULL,
	`workspace_id` text NOT NULL,
	`session_id` text NOT NULL,
	`fidelity_json` text DEFAULT '{}' NOT NULL,
	`checkpoint_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'imported' NOT NULL,
	`status_reason` text,
	`imported_at` integer NOT NULL,
	`last_synced_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_session_imports_source_identity_unique` ON `external_session_imports` (`source_host_id`,`source_app`,`external_session_id`);--> statement-breakpoint
CREATE INDEX `external_session_imports_workspace_id_idx` ON `external_session_imports` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_session_imports_session_id_unique` ON `external_session_imports` (`session_id`);--> statement-breakpoint
CREATE INDEX `external_session_imports_status_idx` ON `external_session_imports` (`status`);