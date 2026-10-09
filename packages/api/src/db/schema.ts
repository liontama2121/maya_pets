import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Esquema D1 (SQLite). Dinero en pesos colombianos enteros (sin decimales).
 * Fechas como texto ISO 8601 en UTC.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const SPECIES = ["perro", "gato", "ambos"] as const;
export type Species = (typeof SPECIES)[number];

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    species: text("species", { enum: SPECIES }).notNull().default("ambos"),
    imageKey: text("image_key"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("categories_slug_uq").on(t.slug)],
);

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    species: text("species", { enum: SPECIES }).notNull().default("ambos"),
    brand: text("brand").notNull().default(""),
    /** Nombre del atributo que diferencia variantes, p. ej. "Peso", "Talla", "Sabor". */
    variantLabel: text("variant_label").notNull().default(""),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("products_slug_uq").on(t.slug),
    index("products_category_idx").on(t.categoryId),
    index("products_species_idx").on(t.species),
  ],
);

export const productVariants = sqliteTable(
  "product_variants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Valor visible de la variante: "2 kg", "M", "Pollo". */
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    price: integer("price").notNull(),
    compareAtPrice: integer("compare_at_price"),
    /** Stock único compartido entre tienda online y POS. */
    stock: integer("stock").notNull().default(0),
    minStock: integer("min_stock").notNull().default(3),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [
    uniqueIndex("variants_sku_uq").on(t.sku),
    index("variants_barcode_idx").on(t.barcode),
    index("variants_product_idx").on(t.productId),
  ],
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    alt: text("alt").notNull().default(""),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("images_product_idx").on(t.productId)],
);

export const STOCK_REASONS = [
  "ENTRADA",
  "AJUSTE",
  "VENTA_ONLINE",
  "VENTA_POS",
  "DEVOLUCION",
  "CREACION",
] as const;

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    stockAfter: integer("stock_after").notNull(),
    reason: text("reason", { enum: STOCK_REASONS }).notNull(),
    note: text("note").notNull().default(""),
    saleId: integer("sale_id"),
    userEmail: text("user_email"),
    userName: text("user_name"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("movements_variant_idx").on(t.variantId, t.createdAt)],
);

export const SEASON_SLUGS = ["halloween", "navidad", "ano-nuevo", "amor-amistad"] as const;
export type SeasonSlug = (typeof SEASON_SLUGS)[number];

/**
 * Eventos de temporada que Luisa activa desde el panel.
 * Un evento está vivo si `enabled` y la fecha actual cae en [startsAt, endsAt],
 * o si `forceActive` está encendido (vista previa en producción / activación manual).
 */
export const seasonEvents = sqliteTable(
  "season_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug", { enum: SEASON_SLUGS }).notNull(),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    forceActive: integer("force_active", { mode: "boolean" }).notNull().default(false),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    headline: text("headline").notNull(),
    message: text("message").notNull().default(""),
    ctaLabel: text("cta_label").notNull().default("Ver la colección"),
    /** Categoría o colección que enlaza el banner (slug de categoría, opcional). */
    categorySlug: text("category_slug"),
    discountNote: text("discount_note").notNull().default(""),
    /** Decoración animada: huellas, hojas, nieve, confeti o corazones que caen. */
    ambient: integer("ambient", { mode: "boolean" }).notNull().default(true),
    featuredProductIds: text("featured_product_ids", { mode: "json" })
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'`),
    updatedAt: text("updated_at").notNull().default(now),
    updatedBy: text("updated_by"),
  },
  (t) => [uniqueIndex("season_slug_uq").on(t.slug)],
);

export const STAFF_ROLES = ["admin", "vendedor", "adopciones"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Personal con acceso al panel. Cloudflare Access autentica (correo);
 * esta tabla autoriza (roles). Sin fila activa = sin acceso aunque Access deje pasar.
 */
export const staffUsers = sqliteTable(
  "staff_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    roles: text("roles", { mode: "json" }).$type<StaffRole[]>().notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(now),
    lastSeenAt: text("last_seen_at"),
  },
  (t) => [uniqueIndex("staff_email_uq").on(t.email)],
);

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type SeasonEvent = typeof seasonEvents.$inferSelect;
export type StaffUser = typeof staffUsers.$inferSelect;

/* ------------------------------ COIN y concurso ------------------------------ */

export const GAMES = ["casa", "lluvia"] as const;
export type GameId = (typeof GAMES)[number];

/** Configuración de la promoción (una sola fila, id = 1). */
export const promoSettings = sqliteTable("promo_settings", {
  id: integer("id").primaryKey(),
  /** Compra mínima en pesos para recibir un COIN. */
  minPurchase: integer("min_purchase").notNull().default(30000),
  attemptsPerCoin: integer("attempts_per_coin").notNull().default(3),
  /** Días que dura un COIN para jugar desde que se entrega. */
  coinValidDays: integer("coin_valid_days").notNull().default(30),
  defaultGame: text("default_game", { enum: GAMES }).notNull().default("casa"),
  updatedAt: text("updated_at").notNull().default(now),
  updatedBy: text("updated_by"),
});

/**
 * Concurso de un mes: juego (habilidad) + rifa (azar).
 */
export const contests = sqliteTable(
  "contests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** AAAA-MM (hora de Bogotá). */
    month: text("month").notNull(),
    game: text("game", { enum: GAMES }).notNull().default("casa"),
    gamePrize: text("game_prize").notNull().default("Regalo sorpresa"),
    raffleEnabled: integer("raffle_enabled", { mode: "boolean" }).notNull().default(true),
    rafflePrize: text("raffle_prize").notNull().default("Regalo sorpresa"),
    /** Sin uso: se dejó la columna para no migrar de nuevo. */
    coljuegosAuth: text("coljuegos_auth"),
    raffleDrawnAt: text("raffle_drawn_at"),
    raffleDrawnBy: text("raffle_drawn_by"),
    raffleWinnerCoinId: integer("raffle_winner_coin_id"),
    raffleTickets: integer("raffle_tickets"),
    gameClosedAt: text("game_closed_at"),
    gameClosedBy: text("game_closed_by"),
    gameWinnerCoinId: integer("game_winner_coin_id"),
    gameWinnerScore: integer("game_winner_score"),
    prizeNotes: text("prize_notes").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("contests_month_uq").on(t.month)],
);

/** Un COIN = N intentos en el juego + 1 boleta para la rifa del mes en que se entregó. */
export const coins = sqliteTable(
  "coins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    /** Mes de la rifa (mes de entrega, hora de Bogotá). */
    month: text("month").notNull(),
    /** Número de boleta dentro del mes: 1, 2, 3… */
    ticket: integer("ticket").notNull(),
    purchaseAmount: integer("purchase_amount").notNull(),
    channel: text("channel", { enum: ["STORE", "ONLINE"] }).notNull().default("STORE"),
    saleRef: text("sale_ref").notNull().default(""),
    issuedBy: text("issued_by").notNull(),
    issuedAt: text("issued_at").notNull().default(now),
    expiresAt: text("expires_at").notNull(),
    attemptsUsed: integer("attempts_used").notNull().default(0),
    attemptsTotal: integer("attempts_total").notNull().default(3),
    playerName: text("player_name"),
    playerContact: text("player_contact"),
    consentAt: text("consent_at"),
    voided: integer("voided", { mode: "boolean" }).notNull().default(false),
    voidReason: text("void_reason").notNull().default(""),
  },
  (t) => [
    uniqueIndex("coins_code_uq").on(t.code),
    uniqueIndex("coins_month_ticket_uq").on(t.month, t.ticket),
    index("coins_month_idx").on(t.month),
  ],
);

/** Cada partida. El puntaje oficial es el que calcula el servidor al repetirla. */
export const gamePlays = sqliteTable(
  "game_plays",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    coinId: integer("coin_id")
      .notNull()
      .references(() => coins.id, { onDelete: "cascade" }),
    /** Mes del concurso en que se jugó. */
    month: text("month").notNull(),
    game: text("game", { enum: GAMES }).notNull(),
    seed: integer("seed").notNull(),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
    score: integer("score"),
    clientScore: integer("client_score"),
    ticks: integer("ticks"),
    valid: integer("valid", { mode: "boolean" }),
    reason: text("reason").notNull().default(""),
  },
  (t) => [index("plays_month_score_idx").on(t.month, t.valid, t.score), index("plays_coin_idx").on(t.coinId)],
);

export type Coin = typeof coins.$inferSelect;
export type Contest = typeof contests.$inferSelect;
export type GamePlay = typeof gamePlays.$inferSelect;

/* -------------------------------- MAYA Kids -------------------------------- */

/**
 * Concurso de dibujo. Luisa lo abre cuando quiera, con sus fechas.
 * La familia publica el dibujo en Instagram invitando a @mayapets como colaborador (Collab);
 * así el post aparece en la cuenta de MAYA y la página lee sus likes. Gana el que tenga más.
 */
export const kidsContests = sqliteTable(
  "kids_contests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    theme: text("theme").notNull(),
    description: text("description").notNull().default(""),
    prize: text("prize").notNull().default("Regalo sorpresa"),
    ageMin: integer("age_min").notNull().default(3),
    ageMax: integer("age_max").notNull().default(12),
    /** Recepción de dibujos: AAAA-MM-DD inclusive (hora de Bogotá). */
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    /** Hasta cuándo cuentan los likes. */
    votingEndsAt: text("voting_ends_at").notNull(),
    winnerEntryId: integer("winner_entry_id"),
    /** Última vez que se trajeron los likes de Instagram (ISO). */
    likesSyncedAt: text("likes_synced_at"),
    closedAt: text("closed_at"),
    closedBy: text("closed_by"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("kids_contests_slug_uq").on(t.slug)],
);

export const KIDS_STATUS = ["pendiente", "aprobado", "publicado", "rechazado"] as const;

/** Dibujo inscrito por el acudiente. En público solo se ve el primer nombre y la edad. */
export const kidsEntries = sqliteTable(
  "kids_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contestId: integer("contest_id")
      .notNull()
      .references(() => kidsContests.id, { onDelete: "cascade" }),
    childName: text("child_name").notNull(),
    childAge: integer("child_age").notNull(),
    drawingTitle: text("drawing_title").notNull().default(""),
    guardianName: text("guardian_name").notNull(),
    guardianContact: text("guardian_contact").notNull(),
    imageKey: text("image_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    status: text("status", { enum: KIDS_STATUS }).notNull().default("pendiente"),
    rejectReason: text("reject_reason").notNull().default(""),
    instagramUrl: text("instagram_url"),
    likes: integer("likes").notNull().default(0),
    likesUpdatedAt: text("likes_updated_at"),
    likesSource: text("likes_source", { enum: ["instagram", "manual"] }),
    consentAt: text("consent_at").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("kids_entries_contest_idx").on(t.contestId, t.status)],
);

export type KidsContest = typeof kidsContests.$inferSelect;
export type KidsEntry = typeof kidsEntries.$inferSelect;

/** Intentos fallidos de inicio de sesión del panel, por IP (bloqueo de 15 min tras 5 fallos). */
export const loginAttempts = sqliteTable("login_attempts", {
  ip: text("ip").primaryKey(),
  fails: integer("fails").notNull().default(0),
  firstAt: integer("first_at").notNull(),
  lockedUntil: integer("locked_until").notNull().default(0),
});
