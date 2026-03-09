import { db } from "./db";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  users, barnehager, vakter, meldinger, samtaleMeldinger, favoritter, onboarding, varsler, pushSubscriptions,
  type User, type InsertUser,
  type Barnehage, type InsertBarnehage,
  type Vakt, type InsertVakt,
  type Melding, type InsertMelding,
  type SamtaleMelding, type InsertSamtaleMelding,
  type Favoritt, type InsertFavoritt,
  type Onboarding, type InsertOnboarding,
  type Varsel, type InsertVarsel,
  type PushSubscription, type InsertPushSubscription,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  getAllBarnehager(): Promise<Barnehage[]>;
  getBarnehage(id: string): Promise<Barnehage | undefined>;
  createBarnehage(b: InsertBarnehage): Promise<Barnehage>;

  getVakter(): Promise<Vakt[]>;
  getVakterByRegion(region: string): Promise<Vakt[]>;
  getVakterByRegions(regions: string[]): Promise<Vakt[]>;
  getVakterByAnsatt(ansattId: string): Promise<Vakt[]>;
  getVakt(id: string): Promise<Vakt | undefined>;
  createVakt(v: InsertVakt): Promise<Vakt>;
  updateVakt(id: string, data: Partial<InsertVakt>): Promise<Vakt | undefined>;
  deleteVakt(id: string): Promise<boolean>;

  getMeldinger(): Promise<Melding[]>;
  getMeldingerByUser(userId: string): Promise<Melding[]>;
  getMelding(id: string): Promise<Melding | undefined>;
  createMelding(m: InsertMelding): Promise<Melding>;
  markMeldingRead(id: string): Promise<void>;
  replyToMelding(id: string, reply: string): Promise<Melding | undefined>;
  closeMelding(id: string): Promise<Melding | undefined>;
  reopenMelding(id: string): Promise<Melding | undefined>;
  deleteMelding(id: string): Promise<boolean>;
  hideMeldingForUser(id: string): Promise<void>;
  markSeenByUser(id: string): Promise<void>;
  markSeenByAdmin(id: string): Promise<void>;

  getSamtaleMeldinger(meldingId: string): Promise<SamtaleMelding[]>;
  createSamtaleMelding(m: InsertSamtaleMelding): Promise<SamtaleMelding>;

  getFavoritter(userId: string): Promise<Favoritt[]>;
  addFavoritt(f: InsertFavoritt): Promise<Favoritt>;
  removeFavoritt(id: string): Promise<void>;

  getOnboarding(userId: string): Promise<Onboarding[]>;
  createOnboarding(o: InsertOnboarding): Promise<Onboarding>;
  toggleOnboarding(id: string, completed: boolean): Promise<Onboarding | undefined>;

  getVarsler(userId: string): Promise<Varsel[]>;
  createVarsel(v: InsertVarsel): Promise<Varsel>;
  markVarselRead(id: string): Promise<void>;
  markAllVarslerRead(userId: string): Promise<void>;
  getUnreadVarselCount(userId: string): Promise<number>;

  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  savePushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(endpoint: string): Promise<void>;
  getUsersByRegion(region: string): Promise<User[]>;
  getUsersByRegions(regions: string[]): Promise<User[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async getAllBarnehager(): Promise<Barnehage[]> {
    return db.select().from(barnehager);
  }

  async getBarnehage(id: string): Promise<Barnehage | undefined> {
    const [b] = await db.select().from(barnehager).where(eq(barnehager.id, id));
    return b;
  }

  async createBarnehage(b: InsertBarnehage): Promise<Barnehage> {
    const [created] = await db.insert(barnehager).values(b).returning();
    return created;
  }

  async getVakter(): Promise<Vakt[]> {
    return db.select().from(vakter).orderBy(desc(vakter.dato));
  }

  async getVakterByRegion(region: string): Promise<Vakt[]> {
    return db.select().from(vakter).where(eq(vakter.region, region)).orderBy(desc(vakter.dato));
  }

  async getVakterByRegions(regions: string[]): Promise<Vakt[]> {
    return db.select().from(vakter).where(inArray(vakter.region, regions)).orderBy(desc(vakter.dato));
  }

  async getVakterByAnsatt(ansattId: string): Promise<Vakt[]> {
    return db.select().from(vakter).where(eq(vakter.ansattId, ansattId)).orderBy(desc(vakter.dato));
  }

  async getVakt(id: string): Promise<Vakt | undefined> {
    const [v] = await db.select().from(vakter).where(eq(vakter.id, id));
    return v;
  }

  async createVakt(v: InsertVakt): Promise<Vakt> {
    const [created] = await db.insert(vakter).values(v).returning();
    return created;
  }

  async updateVakt(id: string, data: Partial<InsertVakt>): Promise<Vakt | undefined> {
    const [updated] = await db.update(vakter).set(data).where(eq(vakter.id, id)).returning();
    return updated;
  }

  async deleteVakt(id: string): Promise<boolean> {
    const [deleted] = await db.delete(vakter).where(eq(vakter.id, id)).returning();
    return !!deleted;
  }

  async getMeldinger(): Promise<Melding[]> {
    return db.select().from(meldinger).orderBy(desc(meldinger.createdAt));
  }

  async getMeldingerByUser(userId: string): Promise<Melding[]> {
    return db.select().from(meldinger).where(eq(meldinger.fromUserId, userId)).orderBy(desc(meldinger.createdAt));
  }

  async createMelding(m: InsertMelding): Promise<Melding> {
    const [created] = await db.insert(meldinger).values(m).returning();
    return created;
  }

  async markMeldingRead(id: string): Promise<void> {
    await db.update(meldinger).set({ read: true }).where(eq(meldinger.id, id));
  }

  async getMelding(id: string): Promise<Melding | undefined> {
    const [m] = await db.select().from(meldinger).where(eq(meldinger.id, id));
    return m;
  }

  async replyToMelding(id: string, reply: string): Promise<Melding | undefined> {
    const [updated] = await db.update(meldinger)
      .set({ reply, repliedAt: new Date(), read: true })
      .where(eq(meldinger.id, id))
      .returning();
    return updated;
  }

  async closeMelding(id: string): Promise<Melding | undefined> {
    const [updated] = await db.update(meldinger)
      .set({ closed: true })
      .where(eq(meldinger.id, id))
      .returning();
    return updated;
  }

  async reopenMelding(id: string): Promise<Melding | undefined> {
    const [updated] = await db.update(meldinger)
      .set({ closed: false })
      .where(eq(meldinger.id, id))
      .returning();
    return updated;
  }

  async deleteMelding(id: string): Promise<boolean> {
    await db.delete(samtaleMeldinger).where(eq(samtaleMeldinger.meldingId, id));
    const [deleted] = await db.delete(meldinger).where(eq(meldinger.id, id)).returning();
    return !!deleted;
  }

  async hideMeldingForUser(id: string): Promise<void> {
    await db.update(meldinger).set({ hiddenByUser: true }).where(eq(meldinger.id, id));
  }

  async markSeenByUser(id: string): Promise<void> {
    await db.update(meldinger).set({ lastSeenByUser: new Date() }).where(eq(meldinger.id, id));
  }

  async markSeenByAdmin(id: string): Promise<void> {
    await db.update(meldinger).set({ lastSeenByAdmin: new Date(), read: true }).where(eq(meldinger.id, id));
  }

  async getSamtaleMeldinger(meldingId: string): Promise<SamtaleMelding[]> {
    return db.select().from(samtaleMeldinger)
      .where(eq(samtaleMeldinger.meldingId, meldingId))
      .orderBy(samtaleMeldinger.createdAt);
  }

  async createSamtaleMelding(m: InsertSamtaleMelding): Promise<SamtaleMelding> {
    const [created] = await db.insert(samtaleMeldinger).values(m).returning();
    return created;
  }

  async getFavoritter(userId: string): Promise<Favoritt[]> {
    return db.select().from(favoritter).where(eq(favoritter.userId, userId));
  }

  async addFavoritt(f: InsertFavoritt): Promise<Favoritt> {
    const [created] = await db.insert(favoritter).values(f).returning();
    return created;
  }

  async removeFavoritt(id: string): Promise<void> {
    await db.delete(favoritter).where(eq(favoritter.id, id));
  }

  async getOnboarding(userId: string): Promise<Onboarding[]> {
    return db.select().from(onboarding).where(eq(onboarding.userId, userId));
  }

  async createOnboarding(o: InsertOnboarding): Promise<Onboarding> {
    const [created] = await db.insert(onboarding).values(o).returning();
    return created;
  }

  async toggleOnboarding(id: string, completed: boolean): Promise<Onboarding | undefined> {
    const [updated] = await db.update(onboarding)
      .set({ completed, completedAt: completed ? new Date() : null })
      .where(eq(onboarding.id, id))
      .returning();
    return updated;
  }

  async getVarsler(userId: string): Promise<Varsel[]> {
    return db.select().from(varsler).where(eq(varsler.userId, userId)).orderBy(desc(varsler.createdAt));
  }

  async createVarsel(v: InsertVarsel): Promise<Varsel> {
    const [created] = await db.insert(varsler).values(v).returning();
    return created;
  }

  async markVarselRead(id: string): Promise<void> {
    await db.update(varsler).set({ read: true }).where(eq(varsler.id, id));
  }

  async markAllVarslerRead(userId: string): Promise<void> {
    await db.update(varsler).set({ read: true }).where(eq(varsler.userId, userId));
  }

  async getUnreadVarselCount(userId: string): Promise<number> {
    const all = await db.select().from(varsler).where(and(eq(varsler.userId, userId), eq(varsler.read, false)));
    return all.length;
  }

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async savePushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
    const [created] = await db.insert(pushSubscriptions).values(sub).returning();
    return created;
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getUsersByRegion(region: string): Promise<User[]> {
    return db.select().from(users).where(and(eq(users.region, region), eq(users.role, "ansatt")));
  }

  async getUsersByRegions(regions: string[]): Promise<User[]> {
    return db.select().from(users).where(and(inArray(users.region, regions), eq(users.role, "ansatt")));
  }
}

export const storage = new DatabaseStorage();
