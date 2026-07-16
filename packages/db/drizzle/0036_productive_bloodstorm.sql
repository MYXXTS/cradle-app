ALTER TABLE `external_session_imports` ADD `bundle_path` text;--> statement-breakpoint
ALTER TABLE `external_session_imports` ADD `bundle_manifest_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `external_session_imports` ADD `parser_version` integer DEFAULT 0 NOT NULL;