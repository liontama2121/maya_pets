CREATE TABLE `coins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`month` text NOT NULL,
	`ticket` integer NOT NULL,
	`purchase_amount` integer NOT NULL,
	`channel` text DEFAULT 'STORE' NOT NULL,
	`sale_ref` text DEFAULT '' NOT NULL,
	`issued_by` text NOT NULL,
	`issued_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text NOT NULL,
	`attempts_used` integer DEFAULT 0 NOT NULL,
	`attempts_total` integer DEFAULT 3 NOT NULL,
	`player_name` text,
	`player_contact` text,
	`consent_at` text,
	`voided` integer DEFAULT false NOT NULL,
	`void_reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coins_code_uq` ON `coins` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `coins_month_ticket_uq` ON `coins` (`month`,`ticket`);--> statement-breakpoint
CREATE INDEX `coins_month_idx` ON `coins` (`month`);--> statement-breakpoint
CREATE TABLE `contests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`game` text DEFAULT 'casa' NOT NULL,
	`game_prize` text DEFAULT 'Regalo sorpresa' NOT NULL,
	`raffle_enabled` integer DEFAULT true NOT NULL,
	`raffle_prize` text DEFAULT 'Regalo sorpresa' NOT NULL,
	`coljuegos_auth` text,
	`raffle_drawn_at` text,
	`raffle_drawn_by` text,
	`raffle_winner_coin_id` integer,
	`raffle_tickets` integer,
	`game_closed_at` text,
	`game_closed_by` text,
	`game_winner_coin_id` integer,
	`game_winner_score` integer,
	`prize_notes` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contests_month_uq` ON `contests` (`month`);--> statement-breakpoint
CREATE TABLE `game_plays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coin_id` integer NOT NULL,
	`month` text NOT NULL,
	`game` text NOT NULL,
	`seed` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`score` integer,
	`client_score` integer,
	`ticks` integer,
	`valid` integer,
	`reason` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`coin_id`) REFERENCES `coins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plays_month_score_idx` ON `game_plays` (`month`,`valid`,`score`);--> statement-breakpoint
CREATE INDEX `plays_coin_idx` ON `game_plays` (`coin_id`);--> statement-breakpoint
CREATE TABLE `promo_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`min_purchase` integer DEFAULT 30000 NOT NULL,
	`attempts_per_coin` integer DEFAULT 3 NOT NULL,
	`coin_valid_days` integer DEFAULT 30 NOT NULL,
	`default_game` text DEFAULT 'casa' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text
);
INSERT INTO promo_settings (id) VALUES (1);
