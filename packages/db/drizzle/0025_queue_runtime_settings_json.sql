ALTER TABLE `chat_session_queue_items` ADD `runtime_settings_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE `chat_session_queue_items`
SET `runtime_settings_json` = json_object(
  'permissionMode', `permission_mode`,
  'accessMode', `runtime_access_mode`,
  'interactionMode', `runtime_interaction_mode`
)
WHERE `permission_mode` IS NOT NULL
   OR `runtime_access_mode` IS NOT NULL
   OR `runtime_interaction_mode` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_session_queue_items` DROP COLUMN `permission_mode`;--> statement-breakpoint
ALTER TABLE `chat_session_queue_items` DROP COLUMN `runtime_access_mode`;--> statement-breakpoint
ALTER TABLE `chat_session_queue_items` DROP COLUMN `runtime_interaction_mode`;
