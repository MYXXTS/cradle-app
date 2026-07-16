CREATE TABLE `database_maintenance_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	`detail_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
INSERT INTO `database_maintenance_tasks` (`id`, `status`, `requested_at`, `detail_json`)
SELECT
	'compact-chat-storage-v1',
	'pending',
	unixepoch(),
	'{"reason":"chat_storage_payload_normalization","migration":37}'
WHERE EXISTS (SELECT 1 FROM `chat_message_payloads` LIMIT 1)
	OR EXISTS (
		SELECT 1
		FROM `backend_run_snapshot_events`
		WHERE json_extract(`payload_json`, '$.schema') = 'cradle.run-snapshot-success-metadata.v1'
		LIMIT 1
	)
ON CONFLICT(`id`) DO NOTHING;
