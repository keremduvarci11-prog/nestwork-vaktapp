import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { insertVaktSchema, insertMeldingSchema, insertBarnehageSchema } from "@shared/schema";
import { appendVaktToSheet, getSpreadsheetUrl } from "./googleSheets";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Ikke innlogget" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Ikke innlogget" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Ingen tilgang" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "nestwork-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    let user = await storage.getUserByUsername(username);
    if (!user) {
      user = await storage.getUserByEmail(username);
    }
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Feil brukernavn/e-post eller passord" });
    }
    req.session.userId = user.id;
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logget ut" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Ikke innlogget" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/users", requireAuth, async (_req, res) => {
    const all = await storage.getAllUsers();
    const safe = all.map(({ password: _, ...u }) => u);
    res.json(safe);
  });

  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    const updated = await storage.updateUser(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  });

  app.get("/api/barnehager", requireAuth, async (_req, res) => {
    const all = await storage.getAllBarnehager();
    res.json(all);
  });

  app.get("/api/barnehager/:id", requireAuth, async (req, res) => {
    const b = await storage.getBarnehage(req.params.id);
    if (!b) return res.status(404).json({ message: "Barnehage ikke funnet" });
    res.json(b);
  });

  app.post("/api/barnehager", requireAdmin, async (req, res) => {
    const parsed = insertBarnehageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const created = await storage.createBarnehage(parsed.data);
    res.json(created);
  });

  const regionGroups: Record<string, string[]> = {
    "Bergen": ["Bergen", "Os"],
    "Os": ["Os"],
  };

  app.get("/api/vakter", requireAuth, async (req, res) => {
    const region = req.query.region as string;
    if (region) {
      const regions = regionGroups[region] || [region];
      const v = await storage.getVakterByRegions(regions);
      return res.json(v);
    }
    const all = await storage.getVakter();
    res.json(all);
  });

  app.get("/api/vakter/mine/:ansattId", requireAuth, async (req, res) => {
    const v = await storage.getVakterByAnsatt(req.params.ansattId);
    res.json(v);
  });

  app.get("/api/vakter/:id", requireAuth, async (req, res) => {
    const v = await storage.getVakt(req.params.id);
    if (!v) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json(v);
  });

  app.post("/api/vakter", requireAdmin, async (req, res) => {
    const parsed = insertVaktSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const created = await storage.createVakt(parsed.data);
    res.json(created);
  });

  app.patch("/api/vakter/:id", requireAuth, async (req, res) => {
    const updated = await storage.updateVakt(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json(updated);
  });

  app.post("/api/vakter/:id/ta", requireAuth, async (req, res) => {
    const { ansattId } = req.body;
    const updated = await storage.updateVakt(req.params.id, {
      status: "venter",
      ansattId,
    });
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json(updated);
  });

  app.post("/api/vakter/:id/godkjenn", requireAdmin, async (req, res) => {
    const updated = await storage.updateVakt(req.params.id, { status: "godkjent" });
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });

    try {
      const ansatt = updated.ansattId ? await storage.getUser(updated.ansattId) : null;
      const barnehage = updated.barnehageId ? await storage.getBarnehage(updated.barnehageId) : null;
      let timer = 0;
      if (updated.startTid && updated.sluttTid) {
        const [sh, sm] = updated.startTid.split(":").map(Number);
        const [eh, em] = updated.sluttTid.split(":").map(Number);
        timer = (eh * 60 + em - sh * 60 - sm) / 60;
      }

      await appendVaktToSheet({
        dato: updated.dato || "",
        barnehageNavn: barnehage?.name || updated.barnehageId || "",
        region: updated.region || "",
        ansattNavn: ansatt?.name || "",
        vikarkode: updated.vikarkode || "",
        startTid: updated.startTid || "",
        sluttTid: updated.sluttTid || "",
        timer: Math.round(timer * 100) / 100,
        status: "godkjent",
      });
    } catch (err) {
      console.error("[Google Sheets] Error:", err);
    }

    res.json(updated);
  });

  app.post("/api/vakter/:id/avslaa", requireAdmin, async (req, res) => {
    const updated = await storage.updateVakt(req.params.id, { status: "ledig", ansattId: null });
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json(updated);
  });

  app.delete("/api/vakter/:id", requireAdmin, async (req, res) => {
    const deleted = await storage.deleteVakt(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json({ success: true });
  });

  app.get("/api/meldinger", requireAdmin, async (_req, res) => {
    const all = await storage.getMeldinger();
    res.json(all);
  });

  app.get("/api/meldinger/user/:userId", requireAuth, async (req, res) => {
    const m = await storage.getMeldingerByUser(req.params.userId);
    res.json(m);
  });

  app.post("/api/meldinger", requireAuth, async (req, res) => {
    const parsed = insertMeldingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const created = await storage.createMelding(parsed.data);
    res.json(created);
  });

  app.patch("/api/meldinger/:id/read", requireAdmin, async (req, res) => {
    await storage.markMeldingRead(req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/meldinger/:id/reply", requireAdmin, async (req, res) => {
    const { reply } = req.body;
    if (!reply?.trim()) return res.status(400).json({ message: "Svar kan ikke vere tomt" });
    const updated = await storage.replyToMelding(req.params.id, reply);
    if (!updated) return res.status(404).json({ message: "Melding ikke funnet" });
    res.json(updated);
  });

  app.patch("/api/meldinger/:id/seen-user", requireAuth, async (req, res) => {
    await storage.markSeenByUser(req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/meldinger/:id/seen-admin", requireAdmin, async (req, res) => {
    await storage.markSeenByAdmin(req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/meldinger/:id/close", requireAdmin, async (req, res) => {
    const updated = await storage.closeMelding(req.params.id);
    if (!updated) return res.status(404).json({ message: "Melding ikke funnet" });
    res.json(updated);
  });

  app.get("/api/meldinger/:id/samtale", requireAuth, async (req, res) => {
    const msgs = await storage.getSamtaleMeldinger(req.params.id);
    res.json(msgs);
  });

  app.post("/api/meldinger/:id/samtale", requireAuth, async (req, res) => {
    const melding = await storage.getMelding(req.params.id);
    if (!melding) return res.status(404).json({ message: "Samtale ikke funnet" });
    if (melding.closed) return res.status(400).json({ message: "Samtalen er avsluttet" });
    const { message, fromUserId } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Melding kan ikke vere tom" });
    const created = await storage.createSamtaleMelding({
      meldingId: req.params.id,
      fromUserId,
      message,
    });
    res.json(created);
  });

  app.get("/api/meldinger/unread-count/admin", requireAdmin, async (_req, res) => {
    const all = await storage.getMeldinger();
    let count = 0;
    for (const m of all) {
      if (m.closed) continue;
      const samtale = await storage.getSamtaleMeldinger(m.id);
      const lastAdminSeen = m.lastSeenByAdmin || new Date(0);
      const hasNewFromUser = !m.read || samtale.some(
        (s) => s.fromUserId !== "admin" && s.createdAt && new Date(s.createdAt) > lastAdminSeen
      );
      if (hasNewFromUser) count++;
    }
    res.json({ count });
  });

  app.get("/api/meldinger/unread-count/user/:userId", requireAuth, async (req, res) => {
    const userMeldinger = await storage.getMeldingerByUser(req.params.userId);
    let count = 0;
    for (const m of userMeldinger) {
      const samtale = await storage.getSamtaleMeldinger(m.id);
      const lastUserSeen = m.lastSeenByUser || m.createdAt || new Date(0);
      const hasNewFromAdmin = samtale.some(
        (s) => s.fromUserId === "admin" && s.createdAt && new Date(s.createdAt) > new Date(lastUserSeen)
      );
      if (hasNewFromAdmin) count++;
    }
    res.json({ count });
  });

  app.get("/api/favoritter/:userId", requireAuth, async (req, res) => {
    const f = await storage.getFavoritter(req.params.userId);
    res.json(f);
  });

  app.post("/api/favoritter", requireAuth, async (req, res) => {
    const created = await storage.addFavoritt(req.body);
    res.json(created);
  });

  app.delete("/api/favoritter/:id", requireAuth, async (req, res) => {
    await storage.removeFavoritt(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/onboarding/:userId", requireAuth, async (req, res) => {
    const items = await storage.getOnboarding(req.params.userId);
    res.json(items);
  });

  app.post("/api/onboarding", requireAuth, async (req, res) => {
    const created = await storage.createOnboarding(req.body);
    res.json(created);
  });

  app.patch("/api/onboarding/:id", requireAuth, async (req, res) => {
    const { completed } = req.body;
    const updated = await storage.toggleOnboarding(req.params.id, completed);
    if (!updated) return res.status(404).json({ message: "Ikke funnet" });
    res.json(updated);
  });

  app.get("/api/sheets-url", requireAdmin, async (_req, res) => {
    const url = await getSpreadsheetUrl();
    res.json({ url });
  });

  return httpServer;
}
