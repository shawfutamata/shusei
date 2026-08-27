CREATE TABLE `attendance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`meeting_date` text NOT NULL,
	`meeting_name` text NOT NULL,
	`venue` text NOT NULL,
	`ocr_text` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attendance_events_owner_date` ON `attendance_events` (`owner_id`,`meeting_date`);--> statement-breakpoint
CREATE TABLE `attendance_people` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`person_name` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`is_important` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `attendance_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attendance_people_event_id` ON `attendance_people` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_attendance_people_owner_important` ON `attendance_people` (`owner_id`,`is_important`);