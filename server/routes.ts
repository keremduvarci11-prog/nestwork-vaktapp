import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { insertVaktSchema, insertMeldingSchema, insertBarnehageSchema } from "@shared/schema";
import { appendVaktToSheet, removeVaktFromSheet, getSpreadsheetUrl } from "./googleSheets";
import { notifyRegion, notifyUser, notifyAdmins } from "./notifications";

const JWT_SECRET = process.env.SESSION_SECRET || "nestwork-secret-key";

function getUserIdFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      return decoded.userId;
    } catch {
      return null;
    }
  }
  if (req.session?.userId) {
    return req.session?.userId || null;
  }
  return null;
}

const uploadDir = path.join(process.cwd(), "uploads", "profiles");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const docsDir = path.join(process.cwd(), "uploads", "documents");
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const docUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, docsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

async function comparePassword(plain: string, hashed: string): Promise<boolean> {
  if (hashed.startsWith("$2")) {
    return bcrypt.compare(plain, hashed);
  }
  return plain === hashed;
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ message: "Ikke innlogget" });
  }
  (req as any)._userId = userId;
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ message: "Ikke innlogget" });
  }
  const user = await storage.getUser(userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Ingen tilgang" });
  }
  (req as any)._userId = userId;
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use("/api", (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  const PgStore = connectPgSimple(session);
  const { pool: sessionPool } = await import("./db");
  await sessionPool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL PRIMARY KEY,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
  app.use(
    session({
      store: new PgStore({
        pool: sessionPool,
        tableName: "session",
      }),
      secret: process.env.SESSION_SECRET || "nestwork-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, maxAge: 365 * 24 * 60 * 60 * 1000 },
    })
  );

  const express = await import("express");
  app.use("/uploads/profiles", express.default.static(path.join(process.cwd(), "uploads", "profiles")));

  app.get("/uploads/documents/:filename", requireAuth, (req, res) => {
    const filePath = path.join(process.cwd(), "uploads", "documents", req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Fil ikke funnet" });
    }
    res.sendFile(filePath);
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    let user = await storage.getUserByUsername(username);
    if (!user) {
      user = await storage.getUserByEmail(username);
    }
    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ message: "Feil brukernavn/e-post eller passord" });
    }
    req.session.userId = user.id;
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "365d" });
    const { password: _, ...safeUser } = user;
    res.json({ ...safeUser, token });
  });

  app.post("/api/auth/logout", (req, res) => {
    if (req.session) {
      req.session.destroy(() => {
        res.json({ message: "Logget ut" });
      });
    } else {
      res.json({ message: "Logget ut" });
    }
  });

  function resolveProfileImage(img: string | null | undefined): string | null {
    if (!img) return null;
    if (img.startsWith("data:")) return img;
    if (img.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), img.startsWith("/") ? `.${img}` : img);
      return fs.existsSync(filePath) ? img : null;
    }
    return img;
  }

  app.get("/api/auth/me", async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Ikke innlogget" });
    }
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = user;
    res.json({ ...safeUser, profileImage: resolveProfileImage(safeUser.profileImage) });
  });

  function resolveProfileImageForList(img: string | null | undefined, userId: string): string | null {
    const resolved = resolveProfileImage(img);
    if (!resolved) return null;
    if (resolved.startsWith("data:")) return `/api/users/${userId}/profile-image-data`;
    return resolved;
  }

  app.get("/api/users/:id/profile-image-data", async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user?.profileImage || !user.profileImage.startsWith("data:")) {
      return res.status(404).json({ message: "Ingen profilbilde" });
    }
    const match = user.profileImage.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(404).json({ message: "Ugyldig bildeformat" });
    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, "base64");
    res.set("Content-Type", mimeType);
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  });

  app.get("/api/users", requireAuth, async (_req, res) => {
    const all = await storage.getAllUsers();
    const safe = all.map(({ password: _, ...u }) => ({
      ...u,
      profileImage: resolveProfileImageForList(u.profileImage, u.id),
    }));
    res.json(safe);
  });

  app.get("/api/admins/meldinger-mottakere", requireAuth, async (_req, res) => {
    const all = await storage.getAllUsers();
    const mottakere = all
      .filter((u) => u.role === "admin" && u.username !== "shakarmahmod")
      .map(({ password: _, ...u }) => u);
    res.json(mottakere);
  });

  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    const { password: pw, ...safeData } = req.body;
    const updated = await storage.updateUser(req.params.id, safeData);
    if (!updated) return res.status(404).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  });

  app.post("/api/users/:id/change-password", requireAuth, async (req, res) => {
    if (getUserIdFromRequest(req) !== req.params.id) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Mangler passord" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Passord må være minst 6 tegn" });
    }
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "Bruker ikke funnet" });
    if (!(await comparePassword(currentPassword, user.password))) {
      return res.status(401).json({ message: "Feil nåværende passord" });
    }
    const hashed = await hashPassword(newPassword);
    await storage.updateUser(req.params.id, { password: hashed });
    res.json({ success: true });
  });

  app.post("/api/users/:id/profile-image", requireAuth, upload.single("image"), async (req, res) => {
    if (getUserIdFromRequest(req) !== req.params.id) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Ingen fil valgt" });
    }
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    const mimeType = req.file.mimetype;
    if (!allowedMimes.includes(mimeType)) {
      return res.status(400).json({ message: "Ugyldig bildeformat" });
    }
    const base64 = req.file.buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const updated = await storage.updateUser(req.params.id, { profileImage: dataUrl });
    if (!updated) return res.status(404).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  });

  app.post("/api/users/:id/upload-cv", requireAuth, docUpload.single("file"), async (req, res) => {
    if (getUserIdFromRequest(req) !== req.params.id) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Ingen fil valgt" });
    }
    const fileUrl = `/uploads/documents/${req.file.filename}`;
    const updated = await storage.updateUser(req.params.id, { cvFile: fileUrl });
    if (!updated) return res.status(404).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  });

  app.post("/api/users/:id/upload-politiattest", requireAuth, docUpload.single("file"), async (req, res) => {
    if (getUserIdFromRequest(req) !== req.params.id) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Ingen fil valgt" });
    }
    const fileUrl = `/uploads/documents/${req.file.filename}`;
    const updated = await storage.updateUser(req.params.id, { politiattestFile: fileUrl });
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
    if (getUserIdFromRequest(req) !== req.params.ansattId) {
      const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ message: "Ingen tilgang" });
      }
    }
    const v = await storage.getVakterByAnsatt(req.params.ansattId);
    res.json(v);
  });

  app.get("/api/vakter/:id", requireAuth, async (req, res) => {
    const v = await storage.getVakt(req.params.id);
    if (!v) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json(v);
  });

  app.get("/api/vakter/:id/kalender", requireAuth, async (req, res) => {
    const v = await storage.getVakt(req.params.id);
    if (!v) return res.status(404).json({ message: "Vakt ikke funnet" });
    const bh = await storage.getBarnehage(v.barnehageId);
    const bhName = bh?.name || "Ukjent barnehage";
    const bhAddress = bh?.address || "";
    const fmtTime = (t: string) => t.replace(/:/g, "").slice(0, 4) + "00";
    const dtStart = v.dato.replace(/-/g, "") + "T" + fmtTime(v.startTid || "07:00:00");
    const dtEnd = v.dato.replace(/-/g, "") + "T" + fmtTime(v.sluttTid || "16:00:00");
    const uid = v.id + "@nestwork";
    const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Nestwork//Vaktapp//NO",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:Vakt - ${bhName}`,
      `LOCATION:${bhAddress}`,
      `DESCRIPTION:Vakt hos ${bhName}\\n${bhAddress}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);
  });

  app.post("/api/vakter", requireAdmin, async (req, res) => {
    const parsed = insertVaktSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const created = await storage.createVakt(parsed.data);

    try {
      const bh = await storage.getBarnehage(created.barnehageId);
      if (created.status === "tildelt" && created.ansattId) {
        await notifyUser(
          created.ansattId,
          "Du har fatt en ny vakt",
          `Nestwork Admin har tildelt deg en vakt ${created.dato} hos ${bh?.name || "ukjent"}. Husk a godkjenne.`,
          "tildeling",
          "/mine-vakter"
        );
      } else {
        await notifyRegion(
          created.region,
          "Ny vakt tilgjengelig",
          `Ny vakt ${created.dato} hos ${bh?.name || "ukjent"} (${created.startTid?.slice(0, 5)} - ${created.sluttTid?.slice(0, 5)})`,
          "vakt",
          "/"
        );
      }
    } catch (err) {
      console.error("[Notify] Feil ved varsling:", err);
    }

    res.json(created);
  });

  app.patch("/api/vakter/:id", requireAdmin, async (req, res) => {
    const before = await storage.getVakt(req.params.id);
    const updated = await storage.updateVakt(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json(updated);

    (async () => {
      try {
        const bh = await storage.getBarnehage(updated.barnehageId);
        const ansattChanged = updated.ansattId && before?.ansattId !== updated.ansattId;
        const becameGodkjent = updated.ansattId && before?.status === "venter" && updated.status === "godkjent";

        if (ansattChanged && (updated.status === "tildelt")) {
          await notifyUser(
            updated.ansattId!,
            "Du har fatt en ny vakt",
            `Nestwork Admin har tildelt deg en vakt ${updated.dato} hos ${bh?.name || "ukjent"}. Husk a godkjenne.`,
            "tildeling",
            "/mine-vakter"
          );
        }

        if (becameGodkjent) {
          await notifyUser(
            updated.ansattId!,
            "Vakten din er godkjent!",
            `Din vakt ${updated.dato} hos ${bh?.name || "ukjent"} (${updated.startTid?.slice(0, 5)} - ${updated.sluttTid?.slice(0, 5)}) er bekreftet.`,
            "vakt",
            "/mine-vakter"
          );
        }

        if (ansattChanged && updated.status === "godkjent") {
          await notifyUser(
            updated.ansattId!,
            "Du har fatt en ny vakt!",
            `Du har fatt vakt ${updated.dato} hos ${bh?.name || "ukjent"} (${updated.startTid?.slice(0, 5)} - ${updated.sluttTid?.slice(0, 5)}).`,
            "vakt",
            "/mine-vakter"
          );
        }

        const needsSheetUpdate = becameGodkjent || (ansattChanged && updated.status === "godkjent");
        if (needsSheetUpdate) {
          if (before?.ansattId && before.status === "godkjent") {
            const oldAnsatt = await storage.getUser(before.ansattId);
            const oldBh = await storage.getBarnehage(before.barnehageId);
            await removeVaktFromSheet(oldBh?.name || before.barnehageId, before.dato || "", oldAnsatt?.name || "");
          }

          let timer = 0;
          if (updated.startTid && updated.sluttTid) {
            const [sh, sm] = updated.startTid.split(":").map(Number);
            const [eh, em] = updated.sluttTid.split(":").map(Number);
            timer = (eh * 60 + em - sh * 60 - sm) / 60;
            if (updated.trekkPause) timer -= 0.5;
            timer = Math.max(0, timer);
          }
          const ansatt = await storage.getUser(updated.ansattId!);
          const barnehage = await storage.getBarnehage(updated.barnehageId);
          await appendVaktToSheet({
            dato: updated.dato || "",
            barnehageNavn: barnehage?.name || updated.barnehageId || "",
            region: updated.region || "",
            ansattNavn: ansatt?.name || "",
            ansattId: ansatt?.externalId || null,
            vikarkode: updated.vikarkode || "",
            startTid: updated.startTid || "",
            sluttTid: updated.sluttTid || "",
            timer: Math.round(timer * 100) / 100,
            trekkPause: updated.trekkPause || false,
            status: "godkjent",
          });
        }
      } catch (err) {
        console.error("[Notify/Sheets] Feil ved vakt-oppdatering:", err);
      }
    })();
  });

  app.post("/api/vakter/:id/ta", requireAuth, async (req, res) => {
    const vakt = await storage.getVakt(req.params.id);
    if (!vakt) return res.status(404).json({ message: "Vakt ikke funnet" });
    if (vakt.status !== "ledig") return res.status(400).json({ message: "Vakten er ikke ledig" });

    const existing = await storage.getVaktInteresser(req.params.id);
    if (existing.some(i => i.ansattId === getUserIdFromRequest(req))) {
      return res.status(400).json({ message: "Du har allerede meldt interesse for denne vakten" });
    }

    const interesse = await storage.createVaktInteresse({
      vaktId: req.params.id,
      ansattId: getUserIdFromRequest(req)!,
    });
    res.json(interesse);

    (async () => {
      try {
        const ansatt = await storage.getUser(getUserIdFromRequest(req)!);
        const bh = await storage.getBarnehage(vakt.barnehageId);
        await notifyAdmins(
          "Ny vaktforespørsel",
          `${ansatt?.name || "En ansatt"} ønsker vakt ${vakt.dato} hos ${bh?.name || "ukjent"}.`,
          "vakt",
          "/admin/godkjenn"
        );
      } catch (err) {
        console.error("[Notify] Feil ved admin-varsling (ta vakt):", err);
      }
    })();
  });

  app.get("/api/vakter/:id/interesser", requireAuth, async (req, res) => {
    const interesser = await storage.getVaktInteresser(req.params.id);
    res.json(interesser);
  });

  app.get("/api/vakt-interesser", requireAuth, async (req, res) => {
    const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
    if (currentUser?.role === "admin") {
      const all = await storage.getAllVaktInteresser();
      return res.json(all);
    }
    const mine = await storage.getVaktInteresserByAnsatt(getUserIdFromRequest(req)!);
    res.json(mine);
  });

  app.post("/api/vakter/:id/tildel", requireAdmin, async (req, res) => {
    const { ansattId } = req.body;
    if (!ansattId) {
      return res.status(400).json({ message: "Mangler ansattId" });
    }
    const before = await storage.getVakt(req.params.id);
    const updated = await storage.updateVakt(req.params.id, {
      status: "tildelt",
      ansattId,
    });
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });

    res.json(updated);

    (async () => {
      try {
        const bh = await storage.getBarnehage(updated.barnehageId);
        await notifyUser(
          ansattId,
          "Du har fatt en ny vakt",
          `Nestwork Admin har tildelt deg en vakt ${updated.dato} hos ${bh?.name || "ukjent"}. Husk a godkjenne.`,
          "tildeling",
          "/mine-vakter"
        );

        if (before?.ansattId && before.ansattId !== ansattId && before.status === "godkjent") {
          const oldAnsatt = await storage.getUser(before.ansattId);
          const oldBh = await storage.getBarnehage(before.barnehageId);
          await removeVaktFromSheet(oldBh?.name || before.barnehageId, before.dato || "", oldAnsatt?.name || "");
        }
      } catch (err) {
        console.error("[Notify/Sheets] Feil ved tildeling:", err);
      }
    })();
  });

  app.post("/api/vakter/:id/godta", requireAuth, async (req, res) => {
    const vakt = await storage.getVakt(req.params.id);
    if (!vakt) return res.status(404).json({ message: "Vakt ikke funnet" });
    if (vakt.status !== "tildelt" || vakt.ansattId !== getUserIdFromRequest(req)) {
      return res.status(403).json({ message: "Denne vakten er ikke tildelt deg" });
    }
    const updated = await storage.updateVakt(req.params.id, { status: "godkjent" });
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });

    res.json(updated);

    (async () => {
      try {
        const ansatt = await storage.getUser(getUserIdFromRequest(req)!);
        const bh = await storage.getBarnehage(updated.barnehageId);
        let timer = 0;
        if (updated.startTid && updated.sluttTid) {
          const [sh, sm] = updated.startTid.split(":").map(Number);
          const [eh, em] = updated.sluttTid.split(":").map(Number);
          timer = (eh * 60 + em - sh * 60 - sm) / 60;
          if (updated.trekkPause) timer -= 0.5;
          timer = Math.max(0, timer);
        }
        await appendVaktToSheet({
          dato: updated.dato || "",
          barnehageNavn: bh?.name || updated.barnehageId || "",
          region: updated.region || "",
          ansattNavn: ansatt?.name || "",
          ansattId: ansatt?.externalId || null,
          vikarkode: updated.vikarkode || "",
          startTid: updated.startTid || "",
          sluttTid: updated.sluttTid || "",
          timer: Math.round(timer * 100) / 100,
          trekkPause: updated.trekkPause || false,
          status: "godkjent",
        });
        await notifyAdmins(
          "Tildelt vakt godtatt",
          `${ansatt?.name || "En ansatt"} har godtatt vakt ${updated.dato} hos ${bh?.name || "ukjent"}.`,
          "vakt",
          "/admin/alle-vakter"
        );
      } catch (err) {
        console.error("Google Sheets/Notify error:", err);
      }
    })();
  });

  app.post("/api/vakter/:id/godkjenn", requireAdmin, async (req, res) => {
    const { ansattId } = req.body || {};
    const updateData: any = { status: "godkjent" };
    if (ansattId) updateData.ansattId = ansattId;

    const updated = await storage.updateVakt(req.params.id, updateData);
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });

    await storage.deleteVaktInteresser(req.params.id);

    if (updated.ansattId) {
      try {
        const bh = await storage.getBarnehage(updated.barnehageId);
        await notifyUser(
          updated.ansattId,
          "Vakten din er godkjent!",
          `Din vakt ${updated.dato} hos ${bh?.name || "ukjent"} (${updated.startTid?.slice(0, 5)} - ${updated.sluttTid?.slice(0, 5)}) er bekreftet.`,
          "vakt",
          "/mine-vakter"
        );
      } catch (err) {
        console.error("[Notify] Feil ved godkjenn-varsling:", err);
      }
    }

    res.json(updated);

    (async () => {
      try {
        const ansatt = updated.ansattId ? await storage.getUser(updated.ansattId) : null;
        const barnehage = updated.barnehageId ? await storage.getBarnehage(updated.barnehageId) : null;
        let timer = 0;
        if (updated.startTid && updated.sluttTid) {
          const [sh, sm] = updated.startTid.split(":").map(Number);
          const [eh, em] = updated.sluttTid.split(":").map(Number);
          timer = (eh * 60 + em - sh * 60 - sm) / 60;
          if (updated.trekkPause) timer -= 0.5;
          timer = Math.max(0, timer);
        }
        await appendVaktToSheet({
          dato: updated.dato || "",
          barnehageNavn: barnehage?.name || updated.barnehageId || "",
          region: updated.region || "",
          ansattNavn: ansatt?.name || "",
          ansattId: ansatt?.externalId || null,
          vikarkode: updated.vikarkode || "",
          startTid: updated.startTid || "",
          sluttTid: updated.sluttTid || "",
          timer: Math.round(timer * 100) / 100,
          trekkPause: updated.trekkPause || false,
          status: "godkjent",
        });
      } catch (err) {
        console.error("[Google Sheets] Error:", err);
      }
    })();
  });

  app.post("/api/vakter/:id/avslaa", requireAdmin, async (req, res) => {
    const before = await storage.getVakt(req.params.id);
    const updated = await storage.updateVakt(req.params.id, { status: "ledig", ansattId: null });
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json(updated);

    if (before?.status === "godkjent" && before.ansattId) {
      (async () => {
        try {
          const oldAnsatt = await storage.getUser(before.ansattId!);
          const oldBh = await storage.getBarnehage(before.barnehageId);
          await removeVaktFromSheet(oldBh?.name || before.barnehageId, before.dato || "", oldAnsatt?.name || "");
        } catch (err) {
          console.error("[Google Sheets] Error removing avslatt vakt:", err);
        }
      })();
    }
  });

  app.delete("/api/vakter/:id", requireAdmin, async (req, res) => {
    const vakt = await storage.getVakt(req.params.id);
    if (!vakt) return res.status(404).json({ message: "Vakt ikke funnet" });
    const deleted = await storage.deleteVakt(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json({ success: true });

    if (vakt.status === "godkjent" && vakt.barnehageId) {
      (async () => {
        try {
          const bh = await storage.getBarnehage(vakt.barnehageId);
          const ansatt = vakt.ansattId ? await storage.getUser(vakt.ansattId) : null;
          await removeVaktFromSheet(bh?.name || vakt.barnehageId, vakt.dato || "", ansatt?.name || "");
        } catch (err) {
          console.error("[Google Sheets] Error removing deleted vakt:", err);
        }
      })();
    }
  });

  app.get("/api/meldinger", requireAdmin, async (_req, res) => {
    const all = await storage.getMeldinger();
    res.json(all);
  });

  app.get("/api/meldinger/user/:userId", requireAuth, async (req, res) => {
    const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
    if (getUserIdFromRequest(req) !== req.params.userId && currentUser?.role !== "admin") {
      return res.status(403).json({ message: "Ikke tilgang" });
    }
    const m = await storage.getMeldingerByUser(req.params.userId);
    res.json(m);
  });

  app.post("/api/meldinger", requireAuth, async (req, res) => {
    const parsed = insertMeldingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const data = parsed.data;
    const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
    data.fromUserId = getUserIdFromRequest(req)!;

    if (currentUser?.role !== "admin" && data.toUserId) {
      const recipient = await storage.getUser(data.toUserId);
      if (!recipient || recipient.role !== "admin" || recipient.username === "shakarmahmod") {
        return res.status(400).json({ message: "Ugyldig mottaker" });
      }
    }

    const created = await storage.createMelding(data);

    if (currentUser?.role === "admin" && data.toUserId) {
      try {
        await notifyUser(
          data.toUserId,
          `${currentUser.name} sendte deg en melding`,
          data.subject,
          "melding",
          "/meldinger"
        );
      } catch (err) {
        console.error("[Notify] Feil ved ny-melding-varsling:", err);
      }
    } else if (currentUser?.role !== "admin" && data.toUserId) {
      try {
        await notifyUser(
          data.toUserId,
          "Ny melding fra ansatt",
          `${currentUser?.name || "En ansatt"}: ${data.subject}`,
          "melding",
          "/admin/meldinger"
        );
      } catch (err) {
        console.error("[Notify] Feil ved admin-varsling (ny melding):", err);
      }
    }

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

  app.patch("/api/meldinger/:id/reopen", requireAdmin, async (req, res) => {
    const updated = await storage.reopenMelding(req.params.id);
    if (!updated) return res.status(404).json({ message: "Melding ikke funnet" });
    res.json(updated);
  });

  app.delete("/api/meldinger/:id", requireAdmin, async (req, res) => {
    const deleted = await storage.deleteMelding(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Melding ikke funnet" });
    res.json({ success: true });
  });

  app.patch("/api/meldinger/:id/hide-user", requireAuth, async (req, res) => {
    await storage.hideMeldingForUser(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/meldinger/:id/samtale", requireAuth, async (req, res) => {
    const melding = await storage.getMelding(req.params.id);
    if (!melding) return res.status(404).json({ message: "Samtale ikke funnet" });
    const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
    const isAdmin = currentUser?.role === "admin";
    const isParticipant = melding.fromUserId === getUserIdFromRequest(req) || melding.toUserId === getUserIdFromRequest(req) || melding.fromUserId === "admin";
    if (!isAdmin && !isParticipant) {
      return res.status(403).json({ message: "Ikke tilgang" });
    }
    const msgs = await storage.getSamtaleMeldinger(req.params.id);
    res.json(msgs);
  });

  app.post("/api/meldinger/:id/samtale", requireAuth, async (req, res) => {
    const melding = await storage.getMelding(req.params.id);
    if (!melding) return res.status(404).json({ message: "Samtale ikke funnet" });
    if (melding.closed) return res.status(400).json({ message: "Samtalen er avsluttet" });
    const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
    const isAdmin = currentUser?.role === "admin";
    const isParticipant = melding.fromUserId === getUserIdFromRequest(req) || melding.toUserId === getUserIdFromRequest(req);
    if (!isAdmin && !isParticipant) {
      return res.status(403).json({ message: "Ikke tilgang" });
    }
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Melding kan ikke vere tom" });
    const created = await storage.createSamtaleMelding({
      meldingId: req.params.id,
      fromUserId: getUserIdFromRequest(req)!,
      message,
    });

    try {
      if (isAdmin) {
        const allAdmins = (await storage.getAllUsers()).filter(u => u.role === "admin");
        const adminIdSet = new Set(allAdmins.map(a => a.id));
        let targetUserId: string | null = null;
        if (melding.fromUserId === "admin" || adminIdSet.has(melding.fromUserId)) {
          targetUserId = melding.toUserId || null;
        } else {
          targetUserId = melding.fromUserId;
        }
        const adminUser = await storage.getUser(getUserIdFromRequest(req)!);
        if (targetUserId && !adminIdSet.has(targetUserId)) {
          await notifyUser(
            targetUserId,
            `Ny melding fra ${adminUser?.name || "Nestwork Admin"}`,
            `Du har fatt en ny melding.`,
            "melding",
            "/meldinger"
          );
        }
      } else {
        const allAdmins = (await storage.getAllUsers()).filter(u => u.role === "admin");
        const adminIdSet = new Set(allAdmins.map(a => a.id));
        let targetAdminId: string | null = null;
        if (melding.toUserId && adminIdSet.has(melding.toUserId)) {
          targetAdminId = melding.toUserId;
        } else if (adminIdSet.has(melding.fromUserId)) {
          targetAdminId = melding.fromUserId;
        }
        if (targetAdminId) {
          await notifyUser(
            targetAdminId,
            "Ny melding fra ansatt",
            `${currentUser?.name || "En ansatt"} har sendt en melding.`,
            "melding",
            "/admin/meldinger"
          );
        } else {
          for (const admin of allAdmins) {
            await notifyUser(
              admin.id,
              "Ny melding fra ansatt",
              `${currentUser?.name || "En ansatt"} har sendt en melding.`,
              "melding",
              "/admin/meldinger"
            );
          }
        }
      }
    } catch (err) {
      console.error("[Notify] Feil ved melding-varsling:", err);
    }

    res.json(created);
  });

  app.get("/api/meldinger/unread-count/admin", requireAdmin, async (req, res) => {
    const all = await storage.getMeldinger();
    const myId = getUserIdFromRequest(req)!;
    const allAdmins = (await storage.getAllUsers()).filter(u => u.role === "admin");
    const adminIds = new Set(allAdmins.map(a => a.id));
    let count = 0;
    for (const m of all) {
      if (m.closed) continue;
      const isMyConversation = m.toUserId === myId || m.fromUserId === myId || m.fromUserId === "admin";
      if (!isMyConversation) continue;
      const samtale = await storage.getSamtaleMeldinger(m.id);
      const lastAdminSeen = m.lastSeenByAdmin || new Date(0);
      const hasNewFromUser = !m.read || samtale.some(
        (s) => !adminIds.has(s.fromUserId) && s.fromUserId !== "admin" && s.createdAt && new Date(s.createdAt) > lastAdminSeen
      );
      if (hasNewFromUser) count++;
    }
    res.json({ count });
  });

  app.get("/api/meldinger/unread-count/user/:userId", requireAuth, async (req, res) => {
    const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
    if (getUserIdFromRequest(req) !== req.params.userId && currentUser?.role !== "admin") {
      return res.status(403).json({ message: "Ikke tilgang" });
    }
    const allAdmins = (await storage.getAllUsers()).filter(u => u.role === "admin");
    const adminIds = new Set(allAdmins.map(a => a.id));
    adminIds.add("admin");
    const userMeldinger = await storage.getMeldingerByUser(req.params.userId);
    let count = 0;
    for (const m of userMeldinger) {
      if (m.hiddenByUser) continue;
      const lastUserSeen = m.lastSeenByUser ? new Date(m.lastSeenByUser) : null;
      if (adminIds.has(m.fromUserId) && !lastUserSeen) {
        count++;
        continue;
      }
      const samtale = await storage.getSamtaleMeldinger(m.id);
      const seenTime = lastUserSeen || (m.createdAt ? new Date(m.createdAt) : new Date(0));
      const hasNewFromAdmin = samtale.some(
        (s) => adminIds.has(s.fromUserId) && s.createdAt && new Date(s.createdAt) > seenTime
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

  app.get("/api/admin/onboarding-overview", requireAdmin, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    const employees = allUsers.filter((u) => u.role !== "admin");
    const overview = await Promise.all(
      employees.map(async (u) => {
        const items = await storage.getOnboarding(u.id);
        const totalCount = items.length;
        const completedCount = items.filter((i) => i.completed).length;
        const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        const { password: _, ...safeUser } = u;
        return {
          userId: u.id,
          name: u.name,
          region: u.region,
          profileImage: resolveProfileImageForList(u.profileImage, u.id),
          cvFile: u.cvFile,
          politiattestFile: u.politiattestFile,
          progress,
          completedCount,
          totalCount,
          items: items.map((i) => ({
            id: i.id,
            item: i.item,
            completed: i.completed,
            completedAt: i.completedAt,
          })),
        };
      })
    );
    res.json(overview);
  });

  app.get("/api/onboarding/:userId", requireAuth, async (req, res) => {
    const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
    if (getUserIdFromRequest(req) !== req.params.userId && currentUser?.role !== "admin") {
      return res.status(403).json({ message: "Ikke tilgang" });
    }
    let items = await storage.getOnboarding(req.params.userId);
    const defaultItems = ["Bytt passord", "Last opp profilbilde", "Last opp CV", "Last opp politiattest", "Signert kontrakt"];
    const existingNames = new Set(items.map((i) => i.item));
    const missing = defaultItems.filter((d) => !existingNames.has(d));
    if (missing.length > 0) {
      for (const item of missing) {
        await storage.createOnboarding({ userId: req.params.userId, item, completed: false });
      }
      items = await storage.getOnboarding(req.params.userId);
    }
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

  app.get("/api/varsler", requireAuth, async (req, res) => {
    const v = await storage.getVarsler(getUserIdFromRequest(req)!);
    res.json(v);
  });

  app.get("/api/varsler/unread-count", requireAuth, async (req, res) => {
    const count = await storage.getUnreadVarselCount(getUserIdFromRequest(req)!);
    res.json({ count });
  });

  app.patch("/api/varsler/:id/read", requireAuth, async (req, res) => {
    await storage.markVarselRead(req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/varsler/read-all", requireAuth, async (req, res) => {
    await storage.markAllVarslerRead(getUserIdFromRequest(req)!);
    res.json({ success: true });
  });

  app.get("/sw.js", (_req, res) => {
    const swPath = path.join(process.cwd(), "client", "public", "sw.js");
    if (fs.existsSync(swPath)) {
      res.setHeader("Content-Type", "application/javascript");
      res.sendFile(swPath);
    } else {
      res.status(404).send("");
    }
  });

  app.get("/api/push/vapid-key", (_req, res) => {
    res.json({ key: process.env.VAPID_PUBLIC_KEY || "" });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      console.log(`[Push] Subscribe rejected: missing fields for user ${getUserIdFromRequest(req)}`);
      return res.status(400).json({ message: "Ugyldig subscription" });
    }
    console.log(`[Push] Saving subscription for user ${getUserIdFromRequest(req)}, endpoint: ${endpoint.substring(0, 60)}...`);
    await storage.savePushSubscription({
      userId: getUserIdFromRequest(req)!,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    const allSubs = await storage.getPushSubscriptions(getUserIdFromRequest(req)!);
    console.log(`[Push] User ${getUserIdFromRequest(req)} now has ${allSubs.length} subscription(s)`);
    res.json({ success: true });
  });

  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    const { endpoint } = req.body;
    if (endpoint) {
      console.log(`[Push] Unsubscribe requested for endpoint: ${endpoint.substring(0, 60)}...`);
      await storage.deletePushSubscription(endpoint);
    }
    res.json({ success: true });
  });

  return httpServer;
}
