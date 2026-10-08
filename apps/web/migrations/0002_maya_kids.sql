CREATE TABLE `kids_contests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`theme` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`prize` text DEFAULT 'Regalo sorpresa' NOT NULL,
	`age_min` integer DEFAULT 3 NOT NULL,
	`age_max` integer DEFAULT 12 NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`voting_ends_at` text NOT NULL,
	`winner_entry_id` integer,
	`closed_at` text,
	`closed_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kids_contests_slug_uq` ON `kids_contests` (`slug`);--> statement-breakpoint
CREATE TABLE `kids_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contest_id` integer NOT NULL,
	`child_name` text NOT NULL,
	`child_age` integer NOT NULL,
	`drawing_title` text DEFAULT '' NOT NULL,
	`guardian_name` text NOT NULL,
	`guardian_contact` text NOT NULL,
	`image_key` text NOT NULL,
	`width` integer,
	`height` integer,
	`status` text DEFAULT 'pendiente' NOT NULL,
	`reject_reason` text DEFAULT '' NOT NULL,
	`instagram_url` text,
	`likes` integer DEFAULT 0 NOT NULL,
	`likes_updated_at` text,
	`likes_source` text,
	`consent_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`contest_id`) REFERENCES `kids_contests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `kids_entries_contest_idx` ON `kids_entries` (`contest_id`,`status`);