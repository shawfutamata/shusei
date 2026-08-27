CREATE TABLE `introductions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`introducer_id` text NOT NULL,
	`person_name` text NOT NULL,
	`person_company` text NOT NULL,
	`relationship` text NOT NULL,
	`fit_reason` text NOT NULL,
	`consent_confirmed` integer NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`points_awarded` integer DEFAULT 10 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`introducer_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`venue` text DEFAULT 'ひるのめぐろ会場' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`intro_count` integer DEFAULT 0 NOT NULL,
	`deal_count` integer DEFAULT 0 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`budget_label` text NOT NULL,
	`area` text NOT NULL,
	`deadline` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
