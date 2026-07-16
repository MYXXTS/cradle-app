DELETE FROM `session_events`
WHERE `aggregate_type` = 'ChatSession'
	AND NOT EXISTS (
		SELECT 1
		FROM `sessions`
		WHERE `sessions`.`id` = `session_events`.`aggregate_id`
	);
--> statement-breakpoint
CREATE TABLE `chat_message_payloads` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`content` text NOT NULL,
	`message_json` text NOT NULL,
	`error_text` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_message_payloads_session_id_idx` ON `chat_message_payloads` (`session_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `chat_message_payloads` (
	`id`, `session_id`, `content`, `message_json`, `error_text`, `created_at`, `updated_at`
)
SELECT `id`, `session_id`, `content`, `message_json`, `error_text`, `created_at`, `updated_at`
FROM `messages`;
--> statement-breakpoint
INSERT OR IGNORE INTO `chat_message_payloads` (
	`id`, `session_id`, `content`, `message_json`, `error_text`, `created_at`, `updated_at`
)
SELECT
	json_extract(`payload`, '$.message.id'),
	json_extract(`payload`, '$.message.sessionId'),
	coalesce(json_extract(`payload`, '$.message.content'), ''),
	coalesce(json_extract(`payload`, '$.message.messageJson'), '{}'),
	json_extract(`payload`, '$.message.errorText'),
	coalesce(json_extract(`payload`, '$.message.createdAt'), `occurred_at`),
	coalesce(json_extract(`payload`, '$.message.updatedAt'), `occurred_at`)
FROM `session_events`
WHERE `event_type` IN ('UserMessageAppended', 'MessageImported', 'SteerApplied')
	AND json_valid(`payload`)
	AND json_type(`payload`, '$.message.id') = 'text';
--> statement-breakpoint
INSERT INTO `chat_message_payloads` (
	`id`, `session_id`, `content`, `message_json`, `error_text`, `created_at`, `updated_at`
)
SELECT
	json_extract(`payload`, '$.message.id'),
	json_extract(`payload`, '$.message.sessionId'),
	coalesce(json_extract(`payload`, '$.message.content'), ''),
	coalesce(json_extract(`payload`, '$.message.messageJson'), '{}'),
	json_extract(`payload`, '$.message.errorText'),
	coalesce(json_extract(`payload`, '$.message.createdAt'), `occurred_at`),
	coalesce(json_extract(`payload`, '$.message.updatedAt'), `occurred_at`)
FROM `session_events`
WHERE `event_type` = 'AssistantMessageCompleted'
	AND json_valid(`payload`)
	AND json_type(`payload`, '$.message.id') = 'text'
ORDER BY `sequence_id` ASC
ON CONFLICT(`id`) DO UPDATE SET
	`session_id` = excluded.`session_id`,
	`content` = excluded.`content`,
	`message_json` = excluded.`message_json`,
	`error_text` = excluded.`error_text`,
	`updated_at` = excluded.`updated_at`;
--> statement-breakpoint
INSERT OR IGNORE INTO `chat_message_payloads` (
	`id`, `session_id`, `content`, `message_json`, `error_text`, `created_at`, `updated_at`
)
SELECT
	json_extract(`payload`, '$.assistantMessage.id'),
	json_extract(`payload`, '$.assistantMessage.sessionId'),
	coalesce(json_extract(`payload`, '$.assistantMessage.content'), ''),
	coalesce(json_extract(`payload`, '$.assistantMessage.messageJson'), '{}'),
	json_extract(`payload`, '$.assistantMessage.errorText'),
	coalesce(json_extract(`payload`, '$.assistantMessage.createdAt'), `occurred_at`),
	coalesce(json_extract(`payload`, '$.assistantMessage.updatedAt'), `occurred_at`)
FROM `session_events`
WHERE `event_type` = 'RunStarted'
	AND json_valid(`payload`)
	AND json_type(`payload`, '$.assistantMessage.id') = 'text'
ORDER BY `sequence_id` DESC;
--> statement-breakpoint
ALTER TABLE `messages` ADD `payload_id` text REFERENCES `chat_message_payloads`(`id`) ON DELETE cascade;
--> statement-breakpoint
UPDATE `messages` SET `payload_id` = `id`;
--> statement-breakpoint
CREATE TRIGGER `messages_payload_id_required_insert`
BEFORE INSERT ON `messages`
WHEN NEW.`payload_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'messages.payload_id is required');
END;
--> statement-breakpoint
CREATE TRIGGER `messages_payload_id_required_update`
BEFORE UPDATE OF `payload_id` ON `messages`
WHEN NEW.`payload_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'messages.payload_id is required');
END;
--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `content`;
--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `message_json`;
--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `error_text`;
--> statement-breakpoint
UPDATE `session_events`
SET `payload` = json_set(
	json_remove(`payload`, '$.message.content', '$.message.messageJson', '$.message.errorText'),
	'$.message.payloadId', json_extract(`payload`, '$.message.id'),
	'$.v', 4
)
WHERE `event_type` IN ('UserMessageAppended', 'MessageImported', 'SteerApplied')
	AND json_valid(`payload`);
--> statement-breakpoint
UPDATE `session_events`
SET `payload` = json_set(
	json_remove(`payload`, '$.assistantMessage.content', '$.assistantMessage.messageJson', '$.assistantMessage.errorText'),
	'$.assistantMessage.payloadId', json_extract(`payload`, '$.assistantMessage.id'),
	'$.v', 4
)
WHERE `event_type` = 'RunStarted'
	AND json_valid(`payload`)
	AND json_type(`payload`, '$.assistantMessage.id') = 'text';
--> statement-breakpoint
UPDATE `session_events`
SET `payload` = json_set(
	json_remove(`payload`, '$.message.content', '$.message.messageJson', '$.message.errorText'),
	'$.message.payloadId', json_extract(`payload`, '$.message.id'),
	'$.v', 4
)
WHERE `event_type` = 'AssistantMessageCompleted'
	AND json_valid(`payload`);
--> statement-breakpoint
UPDATE `session_events`
SET `payload` = json_set(`payload`, '$.v', 4)
WHERE json_valid(`payload`)
	AND coalesce(json_extract(`payload`, '$.v'), 0) != 4;
--> statement-breakpoint
UPDATE `backend_run_snapshot_events`
SET `payload_json` = json_object(
	'schema', 'cradle.run-snapshot-success-metadata.v1',
	'originalLength', length(`payload_json`),
	'coalescedCount', json_extract(`payload_json`, '$.coalescedCount')
)
WHERE `chunk_type` IS NOT NULL
	AND `snapshot_id` IN (
		SELECT `id` FROM `backend_run_snapshots` WHERE `status` = 'complete'
	)
	AND json_extract(`payload_json`, '$.schema') IS NOT 'cradle.run-snapshot-success-metadata.v1';
--> statement-breakpoint
DELETE FROM `backend_run_snapshots`
WHERE `status` = 'complete'
	AND coalesce(`completed_at`, `started_at`) < (unixepoch() * 1000 - 30 * 24 * 60 * 60 * 1000);
--> statement-breakpoint
DELETE FROM `backend_run_snapshots`
WHERE `status` IN ('failed', 'aborted')
	AND coalesce(`completed_at`, `started_at`) < (unixepoch() * 1000 - 7 * 24 * 60 * 60 * 1000);
