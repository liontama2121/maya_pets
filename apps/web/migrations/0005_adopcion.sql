CREATE TABLE `adoption_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`text` text NOT NULL,
	`author` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `adoption_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_request_idx` ON `adoption_notes` (`request_id`);--> statement-breakpoint
CREATE TABLE `adoption_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dog_id` integer,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`neighborhood` text DEFAULT '' NOT NULL,
	`home_type` text NOT NULL,
	`hours_alone` integer NOT NULL,
	`other_pets` text DEFAULT '' NOT NULL,
	`has_kids` integer DEFAULT false NOT NULL,
	`experience` text DEFAULT '' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'nueva' NOT NULL,
	`consent_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dogs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `adoption_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `dog_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dog_id` integer NOT NULL,
	`key` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`width` integer,
	`height` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`dog_id`) REFERENCES `dogs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dog_photos_dog_idx` ON `dog_photos` (`dog_id`);--> statement-breakpoint
CREATE TABLE `dogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`sex` text NOT NULL,
	`age_months` integer NOT NULL,
	`size` text NOT NULL,
	`weight_kg` integer,
	`breed` text DEFAULT 'Criollo' NOT NULL,
	`energy` text DEFAULT 'media' NOT NULL,
	`temperament` text DEFAULT '' NOT NULL,
	`good_with_kids` text DEFAULT 'por_saber' NOT NULL,
	`good_with_dogs` text DEFAULT 'por_saber' NOT NULL,
	`good_with_cats` text DEFAULT 'por_saber' NOT NULL,
	`sterilized` integer DEFAULT false NOT NULL,
	`vaccinated` integer DEFAULT false NOT NULL,
	`dewormed` integer DEFAULT false NOT NULL,
	`story` text DEFAULT '' NOT NULL,
	`special_needs` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'disponible' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`adopted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dogs_slug_uq` ON `dogs` (`slug`);--> statement-breakpoint
CREATE INDEX `dogs_status_idx` ON `dogs` (`status`);