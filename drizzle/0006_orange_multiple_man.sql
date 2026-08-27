CREATE TABLE `business_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`position_title` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`mobile` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`group_name` text DEFAULT '' NOT NULL,
	`exchange_date` text NOT NULL,
	`image_key` text NOT NULL,
	`image_content_type` text NOT NULL,
	`image_version` integer DEFAULT 0 NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_business_cards_owner_date` ON `business_cards` (`owner_id`,`exchange_date`);--> statement-breakpoint
CREATE INDEX `idx_business_cards_owner_favorite` ON `business_cards` (`owner_id`,`is_favorite`);