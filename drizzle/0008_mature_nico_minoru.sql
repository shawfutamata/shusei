ALTER TABLE `members` ADD `membership_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `membership_source` text DEFAULT 'direct_contract' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `membership_period_end` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `organization_id` text DEFAULT '' NOT NULL;