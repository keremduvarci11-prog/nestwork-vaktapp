import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, time, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  kontonummer: text("kontonummer"),
  role: text("role").notNull().default("ansatt"),
  region: text("region").notNull(),
  stilling: text("stilling").notNull(),
  timelonn: decimal("timelonn", { precision: 10, scale: 2 }).notNull(),
  profileImage: text("profile_image"),
  cvFile: text("cv_file"),
  politiattestFile: text("politiattest_file"),
  available: boolean("available").default(true),
  availableWeekend: boolean("available_weekend").default(false),
  status: text("user_status").default("Aktiv"),
  externalId: integer("external_id"),
});

export const barnehager = pgTable("barnehager", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalId: text("external_id"),
  name: text("name").notNull(),
  address: text("address").notNull(),
  region: text("region").notNull(),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  tariff: text("tariff"),
  tariffAssistent: decimal("tariff_assistent", { precision: 10, scale: 2 }),
  tariffLaerer: decimal("tariff_laerer", { precision: 10, scale: 2 }),
  orgnr: text("orgnr"),
  parkering: text("parkering"),
  nokkelkode: text("nokkelkode"),
  rutiner: text("rutiner"),
  aktiv: boolean("aktiv").default(true),
});

export const vakter = pgTable("vakter", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barnehageId: varchar("barnehage_id").notNull(),
  dato: date("dato").notNull(),
  startTid: time("start_tid").notNull(),
  sluttTid: time("slutt_tid").notNull(),
  vikarkode: text("vikarkode").notNull(),
  status: text("status").notNull().default("ledig"),
  ansattId: varchar("ansatt_id"),
  region: text("region").notNull(),
  beskrivelse: text("beskrivelse"),
  trekkPause: boolean("trekk_pause").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const meldinger = pgTable("meldinger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").notNull(),
  toUserId: varchar("to_user_id"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  reply: text("reply"),
  repliedAt: timestamp("replied_at"),
  closed: boolean("closed").default(false),
  hiddenByUser: boolean("hidden_by_user").default(false),
  lastSeenByUser: timestamp("last_seen_by_user"),
  lastSeenByAdmin: timestamp("last_seen_by_admin"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const samtaleMeldinger = pgTable("samtale_meldinger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  meldingId: varchar("melding_id").notNull(),
  fromUserId: varchar("from_user_id").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const favoritter = pgTable("favoritter", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  barnehageId: varchar("barnehage_id").notNull(),
});

export const onboarding = pgTable("onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  item: text("item").notNull(),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
});

export const varsler = pgTable("varsler", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  read: boolean("read").default(false),
  link: text("link"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vaktInteresser = pgTable("vakt_interesser", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vaktId: varchar("vakt_id").notNull(),
  ansattId: varchar("ansatt_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertBarnehageSchema = createInsertSchema(barnehager).omit({ id: true });
export const insertVaktSchema = createInsertSchema(vakter).omit({ id: true, createdAt: true });
export const insertMeldingSchema = createInsertSchema(meldinger).omit({ id: true, createdAt: true });
export const insertSamtaleMeldingSchema = createInsertSchema(samtaleMeldinger).omit({ id: true, createdAt: true });
export const insertFavorittSchema = createInsertSchema(favoritter).omit({ id: true });
export const insertOnboardingSchema = createInsertSchema(onboarding).omit({ id: true });
export const insertVarselSchema = createInsertSchema(varsler).omit({ id: true, createdAt: true });
export const insertVaktInteresseSchema = createInsertSchema(vaktInteresser).omit({ id: true, createdAt: true });
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertBarnehage = z.infer<typeof insertBarnehageSchema>;
export type Barnehage = typeof barnehager.$inferSelect;
export type InsertVakt = z.infer<typeof insertVaktSchema>;
export type Vakt = typeof vakter.$inferSelect;
export type InsertMelding = z.infer<typeof insertMeldingSchema>;
export type Melding = typeof meldinger.$inferSelect;
export type InsertSamtaleMelding = z.infer<typeof insertSamtaleMeldingSchema>;
export type SamtaleMelding = typeof samtaleMeldinger.$inferSelect;
export type InsertFavoritt = z.infer<typeof insertFavorittSchema>;
export type Favoritt = typeof favoritter.$inferSelect;
export type InsertOnboarding = z.infer<typeof insertOnboardingSchema>;
export type Onboarding = typeof onboarding.$inferSelect;
export type InsertVarsel = z.infer<typeof insertVarselSchema>;
export type Varsel = typeof varsler.$inferSelect;
export type InsertVaktInteresse = z.infer<typeof insertVaktInteresseSchema>;
export type VaktInteresse = typeof vaktInteresser.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
