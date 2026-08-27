CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_member_id` ON `push_subscriptions` (`member_id`);--> statement-breakpoint
ALTER TABLE `members` ADD `primary_industry` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `notify_industries` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `requests` ADD `industry_tags` text DEFAULT '[]' NOT NULL;