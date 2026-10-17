CREATE TABLE `content_blocks` (
	`key` text PRIMARY KEY NOT NULL,
	`draft` text NOT NULL,
	`published` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	`published_at` text,
	`published_by` text
);
--> statement-breakpoint
CREATE TABLE `content_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`data` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_versions_key_idx` ON `content_versions` (`key`,`created_at`);--> statement-breakpoint
-- Contenido inicial del banner del inicio: se copia del evento de Halloween que ya estaba publicado.
-- El resto de bloques arranca con los textos por defecto del código (packages/api/src/content.ts).
INSERT OR IGNORE INTO `content_blocks` (`key`, `draft`, `published`, `updated_by`, `published_at`, `published_by`)
SELECT 'banner', j, j, 'Contenido inicial', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Contenido inicial'
FROM (
	SELECT json_object(
		'enabled', json(CASE WHEN `enabled` = 1 OR `force_active` = 1 THEN 'true' ELSE 'false' END),
		'title', `headline`,
		'subtitle', `message`,
		'ctaLabel', 'Ver productos',
		'ctaHref', CASE WHEN `category_slug` IS NULL OR `category_slug` = '' THEN '/tienda' ELSE '/tienda?categoria=' || `category_slug` END,
		'image', json_object('src', '', 'alt', ''),
		'startsAt', `starts_at`,
		'endsAt', `ends_at`,
		'showPrices', json('true'),
		'productIds', json(`featured_product_ids`)
	) AS j
	FROM `season_events` WHERE `slug` = 'halloween'
);
