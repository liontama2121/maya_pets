CREATE TABLE `login_attempts` (
	`ip` text PRIMARY KEY NOT NULL,
	`fails` integer DEFAULT 0 NOT NULL,
	`first_at` integer NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL
);
