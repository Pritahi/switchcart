import {
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(), // stable slug, e.g. "aurora-headphones"
  merchantId: text("merchant_id")
    .notNull()
    .references(() => merchants.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  tags: jsonb("tags").$type<string[]>().notNull(),
  icon: text("icon").notNull().default("package"),
  hue: integer("hue").notNull().default(210),
  inStock: boolean("in_stock").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: text("merchant_id")
    .notNull()
    .references(() => merchants.id),
  status: text("status").notNull().default("CREATED"),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  productSnapshot: jsonb("product_snapshot").$type<Record<string, unknown>>().notNull(),
  buyerName: text("buyer_name").notNull(),
  buyerEmail: text("buyer_email").notNull(),
  prefs: jsonb("prefs").$type<Record<string, unknown>>().notNull(),
  currency: text("currency").notNull().default("USD"),
  amountCents: integer("amount_cents").notNull(), // authorized amount
  finalAmountCents: integer("final_amount_cents"), // captured amount after consent
  replacementProductId: text("replacement_product_id"),
  paypalOrderId: text("paypal_order_id"),
  authorizationId: text("authorization_id"),
  captureId: text("capture_id"),
  paypalStatus: text("paypal_status"),
  mode: text("mode").notNull().default("simulation"), // "sandbox" | "simulation"
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const substitutions = pgTable("substitutions", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  originalProductId: text("original_product_id").notNull(),
  suggestions: jsonb("suggestions").$type<Record<string, unknown>[]>().notNull(),
  aiProvider: text("ai_provider").notNull(), // "ai-api" | "rule-fallback"
  aiModel: text("ai_model"),
  aiRaw: text("ai_raw"),
  chosenProductId: text("chosen_product_id"),
  decision: text("decision").notNull().default("pending"), // pending | accepted | declined | expired
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const auditEvents = pgTable("audit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: uuid("order_id"),
  actor: text("actor").notNull(), // buyer | merchant | ai | system
  event: text("event").notNull(),
  message: text("message"),
  paypalRequestId: text("paypal_request_id"),
  paypalDebugId: text("paypal_debug_id"),
  httpStatus: integer("http_status"),
  simulated: boolean("simulated").notNull().default(false),
  request: jsonb("request"),
  response: jsonb("response"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
