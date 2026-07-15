ALTER TABLE `usage_logs` ADD `run_id` text;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `provider_session_id` text;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `provider_thread_id` text;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `provider_turn_id` text;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `cached_input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `reasoning_output_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `provider_total_prompt_tokens` integer;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `provider_total_cached_input_tokens` integer;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `provider_total_completion_tokens` integer;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `provider_total_reasoning_output_tokens` integer;--> statement-breakpoint
ALTER TABLE `usage_logs` ADD `provider_total_tokens` integer;--> statement-breakpoint
CREATE INDEX `usage_logs_run_id_idx` ON `usage_logs` (`run_id`);--> statement-breakpoint
CREATE INDEX `usage_logs_session_model_created_at_idx` ON `usage_logs` (`session_id`,`model_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `usage_logs_provider_thread_created_at_idx` ON `usage_logs` (`provider_thread_id`,`created_at`);
