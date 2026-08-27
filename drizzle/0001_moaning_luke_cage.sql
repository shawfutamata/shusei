CREATE INDEX `idx_introductions_introducer_id` ON `introductions` (`introducer_id`);--> statement-breakpoint
CREATE INDEX `idx_introductions_request_id` ON `introductions` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_requests_status_created_at` ON `requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_requests_category` ON `requests` (`category`);