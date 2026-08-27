ALTER TABLE `members` ADD `avatar_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `avatar_version` integer DEFAULT 0 NOT NULL;