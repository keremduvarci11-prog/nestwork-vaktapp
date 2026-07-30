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

function asString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function getOsloTodayString(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isPastDateOslo(dato: string | null | undefined): boolean {
  if (!dato) return false;
  return dato < getOsloTodayString();
}

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
  storage: multer.memoryStorage(),
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
    const filePath = path.join(process.cwd(), "uploads", "documents", asString(req.params.filename));
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
    if (user.status === "Deaktivert") {
      return res.status(403).json({ message: "Du har ikke tilgang" });
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
    const blockedIds = ["bb5e32b9-f7d6-4e6e-934e-95937dd828df"];
    if (user.status === "Deaktivert" || blockedIds.includes(user.id)) {
      return res.status(403).json({ message: "Du har ikke tilgang" });
    }
    const { password: _, ...safeUser } = user;
    res.json({
      ...safeUser,
      profileImage: resolveProfileImage(safeUser.profileImage),
      cvFile: resolveDocFileForList(safeUser.cvFile, safeUser.id, "cv"),
      politiattestFile: resolveDocFileForList(safeUser.politiattestFile, safeUser.id, "politiattest"),
    });
  });

  function resolveProfileImageForList(img: string | null | undefined, userId: string): string | null {
    const resolved = resolveProfileImage(img);
    if (!resolved) return null;
    if (resolved.startsWith("data:")) return `/api/users/${userId}/profile-image-data`;
    return resolved;
  }

  app.get("/api/users/:id/profile-image-data", async (req, res) => {
    const user = await storage.getUser(asString(req.params.id));
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

  function resolveDocFile(value: string | null | undefined): string | null {
    if (!value) return null;
    if (value.startsWith("data:")) return value;
    if (value.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), value.startsWith("/") ? `.${value}` : value);
      return fs.existsSync(filePath) ? value : null;
    }
    return value;
  }

  function resolveDocFileForList(value: string | null | undefined, userId: string, kind: "cv" | "politiattest"): string | null {
    const resolved = resolveDocFile(value);
    if (!resolved) return null;
    if (resolved.startsWith("data:")) return `/api/users/${userId}/${kind}-file`;
    return resolved;
  }

  async function serveDocFile(req: Request, res: Response, kind: "cv" | "politiattest") {
    const requesterId = getUserIdFromRequest(req);
    if (!requesterId) return res.status(401).json({ message: "Ikke innlogget" });
    const requester = await storage.getUser(requesterId);
    if (!requester) return res.status(401).json({ message: "Bruker ikke funnet" });
    if (requester.role !== "admin" && requesterId !== asString(req.params.id)) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    const user = await storage.getUser(asString(req.params.id));
    const value = kind === "cv" ? user?.cvFile : user?.politiattestFile;
    if (!value || !value.startsWith("data:")) {
      return res.status(404).json({ message: "Fil ikke funnet" });
    }
    const match = value.match(/^data:([^;]+)(?:;name=([^;]+))?;base64,(.+)$/);
    if (!match) return res.status(404).json({ message: "Ugyldig filformat" });
    const [, mimeType, encodedName, base64Data] = match;
    const buffer = Buffer.from(base64Data, "base64");
    const ext = mimeType === "application/pdf" ? "pdf"
      : mimeType === "application/msword" ? "doc"
      : mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? "docx"
      : mimeType === "image/jpeg" ? "jpg"
      : mimeType === "image/png" ? "png"
      : mimeType === "image/webp" ? "webp"
      : "bin";
    const fallbackName = `${kind === "cv" ? "CV" : "Politiattest"}-${(user?.name || "fil").replace(/[^\w-]+/g, "_")}.${ext}`;
    const filename = encodedName ? decodeURIComponent(encodedName) : fallbackName;
    res.set("Content-Type", mimeType);
    res.set("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
    res.set("Cache-Control", "private, no-cache");
    res.send(buffer);
  }

  app.get("/api/users/:id/cv-file", (req, res) => serveDocFile(req, res, "cv"));
  app.get("/api/users/:id/politiattest-file", (req, res) => serveDocFile(req, res, "politiattest"));

  app.get("/api/users", requireAuth, async (_req, res) => {
    const all = await storage.getAllUsers();
    const safe = all.map(({ password: _, ...u }) => ({
      ...u,
      profileImage: resolveProfileImageForList(u.profileImage, u.id),
      cvFile: resolveDocFileForList(u.cvFile, u.id, "cv"),
      politiattestFile: resolveDocFileForList(u.politiattestFile, u.id, "politiattest"),
    }));
    res.json(safe);
  });

  app.get("/api/admins/meldinger-mottakere", requireAuth, async (_req, res) => {
    const all = await storage.getAllUsers();
    const displayOverrides: Record<string, string> = {
      admin: "Kerem (Daglig Leder)",
      shakarmahmod: "Nestwork Admin",
      simenandreasson: "Simen (HR Ansvarlig)",
    };
    const order = ["admin", "shakarmahmod", "simenandreasson"];
    const mottakere = all
      .filter((u) => u.role === "admin" && order.includes(u.username))
      .map(({ password: _, ...u }) => ({ ...u, name: displayOverrides[u.username] || u.name }))
      .sort((a, b) => order.indexOf(a.username) - order.indexOf(b.username));
    res.json(mottakere);
  });

  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    const { password: pw, ...safeData } = req.body;
    const requesterId = getUserIdFromRequest(req);
    const requester = requesterId ? await storage.getUser(requesterId) : null;
    const isAdmin = requester?.role === "admin";
    const isSelf = requesterId === asString(req.params.id);

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }

    const adminOnlyFields = ["timelonn", "role", "externalId", "username", "status"] as const;
    if (!isAdmin) {
      for (const f of adminOnlyFields) {
        if (f in safeData) {
          return res.status(403).json({
            message: `Bare admin kan endre ${f}`,
          });
        }
      }
    }

    const updated = await storage.updateUser(asString(req.params.id), safeData);
    if (!updated) return res.status(404).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  });

  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteUser(asString(req.params.id));
      if (!ok) return res.status(404).json({ message: "Bruker ikke funnet" });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Delete user error:", err);
      res.status(500).json({ message: err.message || "Kunne ikke slette bruker" });
    }
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const { name, email, phone, address, region, stilling, externalId, role, username: providedUsername, password: providedPassword } = req.body;
      if (!name || !email) {
        return res.status(400).json({ message: "Navn og e-post må fylles ut" });
      }
      const makeUsername = (n: string) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").slice(0, 20);
      let uname = providedUsername || makeUsername(name);
      const existing = await storage.getUserByUsername(uname);
      if (existing) {
        uname = uname + (externalId || Date.now().toString().slice(-4));
      }
      const plainPassword = providedPassword || "nestwork2026";
      const hashed = await hashPassword(plainPassword);
      const created = await storage.createUser({
        username: uname,
        password: hashed,
        name,
        email,
        phone: phone || "",
        address: address || "",
        kontonummer: "",
        role: role || "ansatt",
        region: region || "Alle",
        stilling: stilling || "Barnehageassistent",
        timelonn: "0",
        available: true,
        availableWeekend: false,
        status: "Aktiv",
        externalId: externalId ?? null,
      });
      const onboardingItems = ["Bytt passord", "Last opp profilbilde", "Last opp CV", "Last opp politiattest", "Signert kontrakt"];
      for (const item of onboardingItems) {
        await storage.createOnboarding({ userId: created.id, item, completed: false });
      }
      const { password: _, ...safe } = created;
      res.json(safe);
    } catch (err: any) {
      console.error("Create user error:", err);
      res.status(500).json({ message: err.message || "Kunne ikke opprette bruker" });
    }
  });

  app.post("/api/users/:id/admin-reset-password", requireAdmin, async (req, res) => {
    const { newPassword } = req.body;
    const pw = newPassword || "nestwork2026";
    if (pw.length < 6) return res.status(400).json({ message: "Passord må være minst 6 tegn" });
    const hashed = await hashPassword(pw);
    const updated = await storage.updateUser(asString(req.params.id), { password: hashed });
    if (!updated) return res.status(404).json({ message: "Bruker ikke funnet" });
    res.json({ success: true });
  });

  app.post("/api/users/:id/change-password", requireAuth, async (req, res) => {
    if (getUserIdFromRequest(req) !== asString(req.params.id)) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Mangler passord" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Passord må være minst 6 tegn" });
    }
    const user = await storage.getUser(asString(req.params.id));
    if (!user) return res.status(404).json({ message: "Bruker ikke funnet" });
    if (!(await comparePassword(currentPassword, user.password))) {
      return res.status(401).json({ message: "Feil nåværende passord" });
    }
    const hashed = await hashPassword(newPassword);
    await storage.updateUser(asString(req.params.id), { password: hashed });
    res.json({ success: true });
  });

  app.post("/api/users/:id/profile-image", requireAuth, upload.single("image"), async (req, res) => {
    if (getUserIdFromRequest(req) !== asString(req.params.id)) {
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
    const updated = await storage.updateUser(asString(req.params.id), { profileImage: dataUrl });
    if (!updated) return res.status(404).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  });

  function fileToDataUrl(file: Express.Multer.File): string {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const mime = mimeMap[ext] || file.mimetype || "application/octet-stream";
    const safeName = encodeURIComponent(file.originalname);
    const base64 = file.buffer.toString("base64");
    return `data:${mime};name=${safeName};base64,${base64}`;
  }

  app.post("/api/users/:id/upload-cv", requireAuth, docUpload.single("file"), async (req, res) => {
    if (getUserIdFromRequest(req) !== asString(req.params.id)) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Ingen fil valgt" });
    }
    const dataUrl = fileToDataUrl(req.file);
    const updated = await storage.updateUser(asString(req.params.id), { cvFile: dataUrl });
    if (!updated) return res.status(404).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = updated;
    res.json({ ...safeUser, cvFile: resolveDocFileForList(safeUser.cvFile, safeUser.id, "cv") });
  });

  app.post("/api/users/:id/upload-politiattest", requireAuth, docUpload.single("file"), async (req, res) => {
    if (getUserIdFromRequest(req) !== asString(req.params.id)) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Ingen fil valgt" });
    }
    const dataUrl = fileToDataUrl(req.file);
    const updated = await storage.updateUser(asString(req.params.id), { politiattestFile: dataUrl });
    if (!updated) return res.status(404).json({ message: "Bruker ikke funnet" });
    const { password: _, ...safeUser } = updated;
    res.json({ ...safeUser, politiattestFile: resolveDocFileForList(safeUser.politiattestFile, safeUser.id, "politiattest") });
  });

  const MONTH_NAMES_NB = [
    "Januar", "Februar", "Mars", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Desember",
  ];

  function isValidManed(maned: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(maned);
  }

  function manedLabel(maned: string): string {
    const [y, m] = maned.split("-").map(Number);
    return `${MONTH_NAMES_NB[m - 1]} ${y}`;
  }

  app.get("/api/users/:id/lonnsslipper", requireAuth, async (req, res) => {
    const requesterId = getUserIdFromRequest(req);
    if (!requesterId) return res.status(401).json({ message: "Ikke innlogget" });
    const requester = await storage.getUser(requesterId);
    if (!requester) return res.status(401).json({ message: "Bruker ikke funnet" });
    if (requester.role !== "admin" && requesterId !== asString(req.params.id)) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    const rows = await storage.getLonnsslipperByUser(asString(req.params.id));
    res.json(rows);
  });

  app.post("/api/users/:id/lonnsslipper", requireAdmin, docUpload.single("file"), async (req, res) => {
    const maned = String(req.body?.maned || "").trim();
    if (!isValidManed(maned)) {
      return res.status(400).json({ message: "Ugyldig måned (forventet YYYY-MM)" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Ingen fil valgt" });
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== ".pdf" || req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ message: "Kun PDF-filer er tillatt" });
    }
    const targetUser = await storage.getUser(asString(req.params.id));
    if (!targetUser) return res.status(404).json({ message: "Bruker ikke funnet" });
    const dataUrl = fileToDataUrl(req.file);
    const adminId = getUserIdFromRequest(req) || null;
    const saved = await storage.upsertLonnsslipp({
      userId: asString(req.params.id),
      maned,
      filNavn: req.file.originalname,
      filData: dataUrl,
      opplastetAv: adminId,
    });
    try {
      await notifyUser(
        asString(req.params.id),
        "Ny lønnsslipp tilgjengelig",
        `Lønnsslipp for ${manedLabel(maned)} er lastet opp av admin.`,
        "lonnsslipp",
        "/lonn-timer",
      );
    } catch (err) {
      console.error("[Lonnsslipp] notifyUser failed:", err);
    }
    res.json({
      id: saved.id,
      userId: saved.userId,
      maned: saved.maned,
      filNavn: saved.filNavn,
      opplastetAt: saved.opplastetAt,
      opplastetAv: saved.opplastetAv,
    });
  });

  app.get("/api/users/:id/lonnsslipper/:maned/file", async (req, res) => {
    const requesterId = getUserIdFromRequest(req);
    if (!requesterId) return res.status(401).json({ message: "Ikke innlogget" });
    const requester = await storage.getUser(requesterId);
    if (!requester) return res.status(401).json({ message: "Bruker ikke funnet" });
    if (requester.role !== "admin" && requesterId !== asString(req.params.id)) {
      return res.status(403).json({ message: "Ingen tilgang" });
    }
    if (!isValidManed(asString(req.params.maned))) {
      return res.status(400).json({ message: "Ugyldig måned" });
    }
    const row = await storage.getLonnsslipp(asString(req.params.id), asString(req.params.maned));
    if (!row) return res.status(404).json({ message: "Lønnsslipp ikke funnet" });
    const match = row.filData.match(/^data:([^;]+)(?:;name=([^;]+))?;base64,(.+)$/);
    if (!match) return res.status(404).json({ message: "Ugyldig filformat" });
    const [, mimeType, , base64Data] = match;
    const buffer = Buffer.from(base64Data, "base64");
    const filename = row.filNavn || `lonnsslipp-${asString(req.params.maned)}.pdf`;
    const inline = req.query.inline === "1" || req.query.inline === "true";
    const disposition = inline ? "inline" : "attachment";
    res.set("Content-Type", mimeType);
    res.set("Content-Disposition", `${disposition}; filename="${filename.replace(/"/g, "")}"`);
    res.set("Cache-Control", "private, no-cache");
    res.send(buffer);
  });

  app.delete("/api/users/:id/lonnsslipper/:maned", requireAdmin, async (req, res) => {
    if (!isValidManed(asString(req.params.maned))) {
      return res.status(400).json({ message: "Ugyldig måned" });
    }
    const ok = await storage.deleteLonnsslipp(asString(req.params.id), asString(req.params.maned));
    if (!ok) return res.status(404).json({ message: "Lønnsslipp ikke funnet" });
    res.json({ ok: true });
  });

  app.get("/api/barnehager", requireAuth, async (_req, res) => {
    const all = await storage.getAllBarnehager();
    const regionOrder = ["Bergen", "Os", "Fusa", "Stord", "Haugesund", "Stavanger", "Bryne", "Kristiansand", "Arendal", "Drammen", "Oslo", "Lørenskog", "Fredrikstad", "Trondheim"];
    const sorted = [...all].sort((a, b) => {
      const ai = regionOrder.indexOf(a.region);
      const bi = regionOrder.indexOf(b.region);
      const ax = ai === -1 ? 999 : ai;
      const bx = bi === -1 ? 999 : bi;
      if (ax !== bx) return ax - bx;
      if (ai === -1 && bi === -1 && a.region !== b.region) return a.region.localeCompare(b.region, "no");
      return a.name.localeCompare(b.name, "no");
    });
    res.json(sorted);
  });

  app.get("/api/barnehager/:id", requireAuth, async (req, res) => {
    const b = await storage.getBarnehage(asString(req.params.id));
    if (!b) return res.status(404).json({ message: "Barnehage ikke funnet" });
    res.json(b);
  });

  app.post("/api/barnehager", requireAdmin, async (req, res) => {
    const parsed = insertBarnehageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const created = await storage.createBarnehage(parsed.data);
    res.json(created);
  });

  app.patch("/api/barnehager/:id", requireAdmin, async (req, res) => {
    const updated = await storage.updateBarnehage(asString(req.params.id), req.body);
    if (!updated) return res.status(404).json({ message: "Barnehage ikke funnet" });
    res.json(updated);
  });

  const regionGroups: Record<string, string[]> = {
    "Bergen": ["Bergen", "Os"],
    "Os": ["Os"],
    "Haugesund": ["Haugesund", "Stord"],
    "Stord": ["Haugesund", "Stord"],
  };

  app.get("/api/vakter", requireAuth, async (req, res) => {
    const region = asString(req.query.region);
    if (region) {
      const regions = regionGroups[region] || [region];
      const v = await storage.getVakterByRegions(regions);
      return res.json(v);
    }
    const all = await storage.getVakter();
    res.json(all);
  });

  app.get("/api/vakter/mine/:ansattId", requireAuth, async (req, res) => {
    if (getUserIdFromRequest(req) !== asString(req.params.ansattId)) {
      const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ message: "Ingen tilgang" });
      }
    }
    const v = await storage.getVakterByAnsatt(asString(req.params.ansattId));
    res.json(v);
  });

  app.get("/api/vakter/:id", requireAuth, async (req, res) => {
    const v = await storage.getVakt(asString(req.params.id));
    if (!v) return res.status(404).json({ message: "Vakt ikke funnet" });
    res.json(v);
  });

  app.get("/api/vakter/:id/kalender", requireAuth, async (req, res) => {
    const v = await storage.getVakt(asString(req.params.id));
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

    let payload = parsed.data;
    const autoGodkjenn =
      payload.status === "tildelt" &&
      !!payload.ansattId &&
      isPastDateOslo(payload.dato);
    if (autoGodkjenn) {
      payload = { ...payload, status: "godkjent" };
    }

    const created = await storage.createVakt(payload);

    try {
      const bh = await storage.getBarnehage(created.barnehageId);
      if (autoGodkjenn && created.ansattId) {
        await notifyUser(
          created.ansattId,
          "Vakt registrert",
          `Nestwork Admin har registrert en vakt ${created.dato} hos ${bh?.name || "ukjent"} (${created.startTid?.slice(0, 5)} - ${created.sluttTid?.slice(0, 5)}).`,
          "vakt",
          "/mine-vakter"
        );
      } else if (created.status === "tildelt" && created.ansattId) {
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

      if (autoGodkjenn && created.ansattId) {
        let timer = 0;
        if (created.startTid && created.sluttTid) {
          const [sh, sm] = created.startTid.split(":").map(Number);
          const [eh, em] = created.sluttTid.split(":").map(Number);
          timer = (eh * 60 + em - sh * 60 - sm) / 60;
          if (created.trekkPause) timer -= 0.5;
          timer = Math.max(0, timer);
        }
        const ansatt = await storage.getUser(created.ansattId);
        await appendVaktToSheet({
          dato: created.dato || "",
          barnehageNavn: bh?.name || created.barnehageId || "",
          region: created.region || "",
          ansattNavn: ansatt?.name || "",
          ansattId: ansatt?.externalId || null,
          vikarkode: created.vikarkode || "",
          startTid: created.startTid || "",
          sluttTid: created.sluttTid || "",
          timer: Math.round(timer * 100) / 100,
          trekkPause: created.trekkPause || false,
          status: "godkjent",
          timelonn: ansatt?.timelonn ?? null,
        });
      }
    } catch (err) {
      console.error("[Notify] Feil ved varsling:", err);
    }

    res.json(created);
  });

  app.patch("/api/vakter/:id", requireAdmin, async (req, res) => {
    const before = await storage.getVakt(asString(req.params.id));
    const patch = { ...req.body };
    const effectiveDato = patch.dato ?? before?.dato;
    const effectiveAnsattId = patch.ansattId ?? before?.ansattId;
    const effectiveStatus = patch.status ?? before?.status;
    if (
      effectiveStatus === "tildelt" &&
      effectiveAnsattId &&
      isPastDateOslo(effectiveDato)
    ) {
      patch.status = "godkjent";
    }
    const updated = await storage.updateVakt(asString(req.params.id), patch);
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
            timelonn: ansatt?.timelonn ?? null,
          });
        }
      } catch (err) {
        console.error("[Notify/Sheets] Feil ved vakt-oppdatering:", err);
      }
    })();
  });

  app.post("/api/vakter/:id/ta", requireAuth, async (req, res) => {
    const vakt = await storage.getVakt(asString(req.params.id));
    if (!vakt) return res.status(404).json({ message: "Vakt ikke funnet" });
    if (vakt.status !== "ledig") return res.status(400).json({ message: "Vakten er ikke ledig" });

    const existing = await storage.getVaktInteresser(asString(req.params.id));
    if (existing.some(i => i.ansattId === getUserIdFromRequest(req))) {
      return res.status(400).json({ message: "Du har allerede meldt interesse for denne vakten" });
    }

    const interesse = await storage.createVaktInteresse({
      vaktId: asString(req.params.id),
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
    const interesser = await storage.getVaktInteresser(asString(req.params.id));
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
    const before = await storage.getVakt(asString(req.params.id));
    const autoGodkjenn = isPastDateOslo(before?.dato);
    const newStatus = autoGodkjenn ? "godkjent" : "tildelt";
    const updated = await storage.updateVakt(asString(req.params.id), {
      status: newStatus,
      ansattId,
    });
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });

    res.json(updated);

    (async () => {
      try {
        const bh = await storage.getBarnehage(updated.barnehageId);
        if (autoGodkjenn) {
          await notifyUser(
            ansattId,
            "Vakt registrert",
            `Nestwork Admin har registrert en vakt ${updated.dato} hos ${bh?.name || "ukjent"} (${updated.startTid?.slice(0, 5)} - ${updated.sluttTid?.slice(0, 5)}).`,
            "vakt",
            "/mine-vakter"
          );
        } else {
          await notifyUser(
            ansattId,
            "Du har fatt en ny vakt",
            `Nestwork Admin har tildelt deg en vakt ${updated.dato} hos ${bh?.name || "ukjent"}. Husk a godkjenne.`,
            "tildeling",
            "/mine-vakter"
          );
        }

        if (before?.ansattId && before.ansattId !== ansattId && before.status === "godkjent") {
          const oldAnsatt = await storage.getUser(before.ansattId);
          const oldBh = await storage.getBarnehage(before.barnehageId);
          await removeVaktFromSheet(oldBh?.name || before.barnehageId, before.dato || "", oldAnsatt?.name || "");
        }

        if (autoGodkjenn) {
          let timer = 0;
          if (updated.startTid && updated.sluttTid) {
            const [sh, sm] = updated.startTid.split(":").map(Number);
            const [eh, em] = updated.sluttTid.split(":").map(Number);
            timer = (eh * 60 + em - sh * 60 - sm) / 60;
            if (updated.trekkPause) timer -= 0.5;
            timer = Math.max(0, timer);
          }
          const ansatt = await storage.getUser(ansattId);
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
            timelonn: ansatt?.timelonn ?? null,
          });
        }
      } catch (err) {
        console.error("[Notify/Sheets] Feil ved tildeling:", err);
      }
    })();
  });

  app.post("/api/vakter/:id/godta", requireAuth, async (req, res) => {
    const vakt = await storage.getVakt(asString(req.params.id));
    if (!vakt) return res.status(404).json({ message: "Vakt ikke funnet" });
    if (vakt.status !== "tildelt" || vakt.ansattId !== getUserIdFromRequest(req)) {
      return res.status(403).json({ message: "Denne vakten er ikke tildelt deg" });
    }
    const updated = await storage.updateVakt(asString(req.params.id), { status: "godkjent" });
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
          timelonn: ansatt?.timelonn ?? null,
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

  app.post("/api/vakter/:id/innsend-timer", requireAuth, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    const vakt = await storage.getVakt(asString(req.params.id));
    if (!vakt) return res.status(404).json({ message: "Vakt ikke funnet" });
    if (vakt.ansattId !== userId) {
      return res.status(403).json({ message: "Du kan kun sende inn timer for dine egne vakter" });
    }
    if (vakt.status !== "godkjent") {
      return res.status(400).json({ message: "Kun godkjente vakter kan sendes inn" });
    }
    if (vakt.timerInnsendt) {
      return res.status(400).json({ message: "Timer er allerede sendt inn for denne vakten" });
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (vakt.dato > todayStr) {
      return res.status(400).json({ message: "Du kan ikke sende inn timer for en fremtidig vakt" });
    }

    const updated = await storage.markVaktTimerInnsendt(asString(req.params.id));
    if (!updated) {
      return res.status(409).json({ message: "Timer er allerede sendt inn for denne vakten" });
    }
    res.json(updated);

    (async () => {
      try {
        const ansatt = await storage.getUser(userId!);
        const bh = await storage.getBarnehage(updated.barnehageId);
        await notifyAdmins(
          "Timer innsendt for godkjenning",
          `${ansatt?.name || "En ansatt"} har sendt inn timer for vakt ${updated.dato} hos ${bh?.name || "ukjent"}.`,
          "vakt",
          "/admin/godkjenn"
        );
      } catch (err) {
        console.error("[Notify] Feil ved innsend-varsling:", err);
      }
    })();
  });

  app.post("/api/vakter/:id/godkjenn-timer", requireAdmin, async (req, res) => {
    const vakt = await storage.getVakt(asString(req.params.id));
    if (!vakt) return res.status(404).json({ message: "Vakt ikke funnet" });
    if (!vakt.timerInnsendt) {
      return res.status(400).json({ message: "Timer er ikke sendt inn for denne vakten" });
    }
    if (vakt.timerGodkjent) {
      return res.status(400).json({ message: "Timer er allerede godkjent" });
    }
    const updated = await storage.markVaktTimerGodkjent(asString(req.params.id));
    if (!updated) {
      return res.status(409).json({ message: "Timer er allerede godkjent" });
    }
    res.json(updated);
  });

  app.post("/api/vakter/:id/godkjenn", requireAdmin, async (req, res) => {
    const { ansattId } = req.body || {};
    const updateData: any = { status: "godkjent" };
    if (ansattId) updateData.ansattId = ansattId;

    const updated = await storage.updateVakt(asString(req.params.id), updateData);
    if (!updated) return res.status(404).json({ message: "Vakt ikke funnet" });

    await storage.deleteVaktInteresser(asString(req.params.id));

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
          timelonn: ansatt?.timelonn ?? null,
        });
      } catch (err) {
        console.error("[Google Sheets] Error:", err);
      }
    })();
  });

  app.post("/api/vakter/:id/avslaa", requireAdmin, async (req, res) => {
    const before = await storage.getVakt(asString(req.params.id));
    const updated = await storage.updateVakt(asString(req.params.id), { status: "ledig", ansattId: null });
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
    const vakt = await storage.getVakt(asString(req.params.id));
    if (!vakt) return res.status(404).json({ message: "Vakt ikke funnet" });
    const deleted = await storage.deleteVakt(asString(req.params.id));
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
    if (getUserIdFromRequest(req) !== asString(req.params.userId) && currentUser?.role !== "admin") {
      return res.status(403).json({ message: "Ikke tilgang" });
    }
    const m = await storage.getMeldingerByUser(asString(req.params.userId));
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
        await notifyAdmins(
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
    await storage.markMeldingRead(asString(req.params.id));
    res.json({ success: true });
  });

  app.patch("/api/meldinger/:id/reply", requireAdmin, async (req, res) => {
    const { reply } = req.body;
    if (!reply?.trim()) return res.status(400).json({ message: "Svar kan ikke vere tomt" });
    const updated = await storage.replyToMelding(asString(req.params.id), reply);
    if (!updated) return res.status(404).json({ message: "Melding ikke funnet" });
    res.json(updated);
  });

  app.patch("/api/meldinger/:id/seen-user", requireAuth, async (req, res) => {
    await storage.markSeenByUser(asString(req.params.id));
    res.json({ success: true });
  });

  app.patch("/api/meldinger/:id/seen-admin", requireAdmin, async (req, res) => {
    await storage.markSeenByAdmin(asString(req.params.id));
    res.json({ success: true });
  });

  app.patch("/api/meldinger/:id/close", requireAdmin, async (req, res) => {
    const updated = await storage.closeMelding(asString(req.params.id));
    if (!updated) return res.status(404).json({ message: "Melding ikke funnet" });
    res.json(updated);
  });

  app.patch("/api/meldinger/:id/reopen", requireAdmin, async (req, res) => {
    const updated = await storage.reopenMelding(asString(req.params.id));
    if (!updated) return res.status(404).json({ message: "Melding ikke funnet" });
    res.json(updated);
  });

  app.delete("/api/meldinger/:id", requireAdmin, async (req, res) => {
    const deleted = await storage.deleteMelding(asString(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Melding ikke funnet" });
    res.json({ success: true });
  });

  app.patch("/api/meldinger/:id/hide-user", requireAuth, async (req, res) => {
    await storage.hideMeldingForUser(asString(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/meldinger/:id/samtale", requireAuth, async (req, res) => {
    const melding = await storage.getMelding(asString(req.params.id));
    if (!melding) return res.status(404).json({ message: "Samtale ikke funnet" });
    const currentUser = await storage.getUser(getUserIdFromRequest(req)!);
    const isAdmin = currentUser?.role === "admin";
    const isParticipant = melding.fromUserId === getUserIdFromRequest(req) || melding.toUserId === getUserIdFromRequest(req) || melding.fromUserId === "admin";
    if (!isAdmin && !isParticipant) {
      return res.status(403).json({ message: "Ikke tilgang" });
    }
    const msgs = await storage.getSamtaleMeldinger(asString(req.params.id));
    res.json(msgs);
  });

  app.post("/api/meldinger/:id/samtale", requireAuth, async (req, res) => {
    const melding = await storage.getMelding(asString(req.params.id));
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
      meldingId: asString(req.params.id),
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
    if (getUserIdFromRequest(req) !== asString(req.params.userId) && currentUser?.role !== "admin") {
      return res.status(403).json({ message: "Ikke tilgang" });
    }
    const allAdmins = (await storage.getAllUsers()).filter(u => u.role === "admin");
    const adminIds = new Set(allAdmins.map(a => a.id));
    adminIds.add("admin");
    const userMeldinger = await storage.getMeldingerByUser(asString(req.params.userId));
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
    const f = await storage.getFavoritter(asString(req.params.userId));
    res.json(f);
  });

  app.post("/api/favoritter", requireAuth, async (req, res) => {
    const created = await storage.addFavoritt(req.body);
    res.json(created);
  });

  app.delete("/api/favoritter/:id", requireAuth, async (req, res) => {
    await storage.removeFavoritt(asString(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/admin/onboarding-overview", requireAdmin, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    const employees = allUsers.filter((u) => u.role !== "admin");

    // Pre-fetch all vakter to compute monthly brutto per employee
    const allVakter = await storage.getVakter();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

    const calcHours = (start: string, end: string, trekkPause?: boolean | null) => {
      if (!start || !end) return 0;
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      let h = (eh * 60 + em - sh * 60 - sm) / 60;
      if (trekkPause) h -= 0.5;
      return Math.max(0, h);
    };

    const monthAggByUser = new Map<string, { hours: number; count: number }>();
    for (const v of allVakter) {
      if (!v.ansattId || !v.dato) continue;
      if (v.status !== "godkjent") continue;
      const d = new Date(v.dato + "T00:00:00");
      if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) continue;
      const h = calcHours(v.startTid || "", v.sluttTid || "", v.trekkPause);
      const cur = monthAggByUser.get(v.ansattId) || { hours: 0, count: 0 };
      cur.hours += h;
      cur.count += 1;
      monthAggByUser.set(v.ansattId, cur);
    }

    const overview = await Promise.all(
      employees.map(async (u) => {
        const items = await storage.getOnboarding(u.id);
        const totalCount = items.length;
        const completedCount = items.filter((i) => i.completed).length;
        const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        const agg = monthAggByUser.get(u.id) || { hours: 0, count: 0 };
        const tl = parseFloat(u.timelonn || "0") || 0;
        const bruttoThisMonth = Math.round(agg.hours * tl * 100) / 100;
        const { password: _, ...safeUser } = u;
        return {
          userId: u.id,
          name: u.name,
          region: u.region,
          username: u.username,
          email: u.email,
          phone: u.phone,
          stilling: u.stilling,
          timelonn: u.timelonn,
          profileImage: resolveProfileImageForList(u.profileImage, u.id),
          cvFile: resolveDocFileForList(u.cvFile, u.id, "cv"),
          politiattestFile: resolveDocFileForList(u.politiattestFile, u.id, "politiattest"),
          progress,
          completedCount,
          totalCount,
          monthKey,
          godkjentTimerThisMonth: Math.round(agg.hours * 100) / 100,
          godkjentVakterThisMonth: agg.count,
          bruttoThisMonth,
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
    if (getUserIdFromRequest(req) !== asString(req.params.userId) && currentUser?.role !== "admin") {
      return res.status(403).json({ message: "Ikke tilgang" });
    }
    let items = await storage.getOnboarding(asString(req.params.userId));
    const defaultItems = ["Bytt passord", "Last opp profilbilde", "Last opp CV", "Last opp politiattest", "Signert kontrakt"];
    const existingNames = new Set(items.map((i) => i.item));
    const missing = defaultItems.filter((d) => !existingNames.has(d));
    if (missing.length > 0) {
      for (const item of missing) {
        await storage.createOnboarding({ userId: asString(req.params.userId), item, completed: false });
      }
      items = await storage.getOnboarding(asString(req.params.userId));
    }
    res.json(items);
  });

  app.post("/api/onboarding", requireAuth, async (req, res) => {
    const created = await storage.createOnboarding(req.body);
    res.json(created);
  });

  app.patch("/api/onboarding/:id", requireAuth, async (req, res) => {
    const { completed } = req.body;
    const updated = await storage.toggleOnboarding(asString(req.params.id), completed);
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
    await storage.markVarselRead(asString(req.params.id));
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
    const isNative = typeof endpoint === "string" && (endpoint.startsWith("apns://") || endpoint.startsWith("fcm://"));
    if (!endpoint || (!isNative && (!keys?.p256dh || !keys?.auth))) {
      console.log(`[Push] Subscribe rejected: missing fields for user ${getUserIdFromRequest(req)} (endpoint: ${endpoint?.substring(0, 30)})`);
      return res.status(400).json({ message: "Ugyldig subscription" });
    }
    console.log(`[Push] Saving subscription for user ${getUserIdFromRequest(req)}, endpoint: ${endpoint.substring(0, 60)}...`);
    await storage.savePushSubscription({
      userId: getUserIdFromRequest(req)!,
      endpoint,
      p256dh: keys?.p256dh ?? keys?.deviceToken ?? "",
      auth: keys?.auth ?? keys?.deviceToken ?? "",
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

  // ===== Tilgjengelighet (Availability) =====
  const isValidDate = (s: unknown): s is string => {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  };
  const isValidMonth = (s: unknown): s is string => {
    if (typeof s !== "string" || !/^\d{4}-\d{2}$/.test(s)) return false;
    const [, m] = s.split("-").map(Number);
    return m >= 1 && m <= 12;
  };
  const isValidStatus = (s: unknown): s is "available" | "unavailable" =>
    s === "available" || s === "unavailable";

  // Ansatt: hent egen tilgjengelighet (valgfritt month=YYYY-MM)
  app.get("/api/availability/me", requireAuth, async (req, res) => {
    const userId = getUserIdFromRequest(req)!;
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    if (month !== undefined && !isValidMonth(month)) {
      return res.status(400).json({ message: "Ugyldig måned" });
    }
    let from: string | undefined;
    let to: string | undefined;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const last = new Date(y, m, 0).getDate();
      from = `${month}-01`;
      to = `${month}-${String(last).padStart(2, "0")}`;
    }
    const rows = await storage.getAvailabilityByUser(userId, from, to);
    res.json(rows);
  });

  // Ansatt: sett egen status for en dag
  app.put("/api/availability/me", requireAuth, async (req, res) => {
    const userId = getUserIdFromRequest(req)!;
    const { date, status } = req.body || {};
    if (!isValidDate(date) || !isValidStatus(status)) {
      return res.status(400).json({ message: "Ugyldig dato eller status" });
    }
    // Ikke tillat fortidsdager
    const todayIso = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    if (date < todayIso) {
      return res.status(400).json({ message: "Du kan ikke endre fortidsdager" });
    }
    // Ikke tillat helger (lør=6, søn=0)
    const [yy, mm, dd] = date.split("-").map(Number);
    const wd = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
    if (wd === 0 || wd === 6) {
      return res.status(400).json({ message: "Du kan ikke sette tilgjengelighet på helger" });
    }
    // Atomisk: skriv kun hvis ikke blokkert (ingen TOCTOU-rase)
    const row = await storage.setAvailabilityIfNotBlocked(userId, date, status);
    if (!row) {
      return res.status(400).json({ message: "Denne dagen er blokkert av admin" });
    }
    res.json(row);
  });

  // Ansatt: fjern status for en dag (-> "Nøytral/Grå")
  app.delete("/api/availability/me/:date", requireAuth, async (req, res) => {
    const userId = getUserIdFromRequest(req)!;
    const { date } = req.params;
    if (!isValidDate(date)) {
      return res.status(400).json({ message: "Ugyldig dato" });
    }
    await storage.deleteAvailability(userId, date);
    res.json({ success: true });
  });

  // Admin: alle ansatte med 'available' for en dato (med vakter-overlay + blokkert-flagg)
  app.get("/api/admin/availability/by-date/:date", requireAdmin, async (req, res) => {
    const { date } = req.params;
    if (!isValidDate(date)) {
      return res.status(400).json({ message: "Ugyldig dato" });
    }
    const [rows, allUsers, allVakter, blocked] = await Promise.all([
      storage.getAvailabilityByDate(date),
      storage.getAllUsers(),
      storage.getVakter(),
      storage.isBlockedDate(date),
    ]);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const vaktByUserOnDate = new Set(
      allVakter
        .filter((v) => v.dato === date && v.ansattId)
        .map((v) => v.ansattId as string),
    );
    const employees = rows
      .filter((r) => r.status === "available")
      .map((r) => {
        const u = userMap.get(r.userId);
        if (!u) return null;
        const hasShift = vaktByUserOnDate.has(r.userId);
        return {
          userId: r.userId,
          name: u.name,
          stilling: u.stilling,
          region: u.region,
          profileImage: u.profileImage,
          status: hasShift ? "assigned" : "available",
        };
      })
      .filter(Boolean);
    res.json({ blocked, employees });
  });

  // Alle innloggede: hent blokkerte datoer (valgfritt month=YYYY-MM)
  app.get("/api/blocked-dates", requireAuth, async (req, res) => {
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    if (month !== undefined && !isValidMonth(month)) {
      return res.status(400).json({ message: "Ugyldig måned" });
    }
    let from: string | undefined;
    let to: string | undefined;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const last = new Date(y, m, 0).getDate();
      from = `${month}-01`;
      to = `${month}-${String(last).padStart(2, "0")}`;
    }
    const rows = await storage.getBlockedDates(from, to);
    res.json(rows);
  });

  // Admin: blokker en dato
  app.post("/api/admin/blocked-dates", requireAdmin, async (req, res) => {
    const { date, reason } = req.body || {};
    if (!isValidDate(date)) {
      return res.status(400).json({ message: "Ugyldig dato" });
    }
    const reasonStr = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : null;
    const row = await storage.addBlockedDate(date, reasonStr);
    res.json(row);
  });

  // Admin: fjern blokkering
  app.delete("/api/admin/blocked-dates/:date", requireAdmin, async (req, res) => {
    const { date } = req.params;
    if (!isValidDate(date)) {
      return res.status(400).json({ message: "Ugyldig dato" });
    }
    await storage.removeBlockedDate(date);
    res.json({ success: true });
  });

  // Admin: en spesifikk ansatts tilgjengelighet for en måned (med vakt-overlay)
  app.get("/api/admin/availability/user/:userId", requireAdmin, async (req, res) => {
    const userId = asString(req.params.userId);
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    if (month !== undefined && !isValidMonth(month)) {
      return res.status(400).json({ message: "Ugyldig måned" });
    }
    let from: string | undefined;
    let to: string | undefined;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const last = new Date(y, m, 0).getDate();
      from = `${month}-01`;
      to = `${month}-${String(last).padStart(2, "0")}`;
    }
    const [avail, vakterAll, blocked] = await Promise.all([
      storage.getAvailabilityByUser(userId, from, to),
      storage.getVakterByAnsatt(userId),
      storage.getBlockedDates(from, to),
    ]);
    const vaktDates = new Set(
      vakterAll
        .filter((v) => (!from || v.dato >= from) && (!to || v.dato <= to))
        .map((v) => v.dato),
    );
    res.json({
      availability: avail.map((a) => ({ date: a.date, status: a.status })),
      shiftDates: Array.from(vaktDates),
      blockedDates: blocked.map((b) => b.date),
    });
  });

  const PERSONALREGLER_VERSION = 1;

  app.get("/api/personalregler/status", requireAuth, async (req, res) => {
    const userId = getUserIdFromRequest(req)!;
    const row = await storage.getPersonalreglerGodkjenning(userId, PERSONALREGLER_VERSION);
    res.json({
      accepted: !!row,
      acceptedAt: row?.acceptedAt?.toISOString() || null,
      currentVersion: PERSONALREGLER_VERSION,
    });
  });

  app.post("/api/personalregler/accept", requireAuth, async (req, res) => {
    const userId = getUserIdFromRequest(req)!;
    const row = await storage.createPersonalreglerGodkjenning(userId, PERSONALREGLER_VERSION);
    res.json({
      accepted: true,
      acceptedAt: row.acceptedAt?.toISOString() || null,
    });
  });

  return httpServer;
}
