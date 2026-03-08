import { db } from "./db";
import { users, barnehager, vakter, onboarding, meldinger } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  const existingUsers = await db.select().from(users);
  if (existingUsers.length > 0) return;

  const [admin] = await db.insert(users).values({
    username: "admin",
    password: "admin123",
    name: "Maria Olsen",
    email: "maria@nestwork.no",
    phone: "99887766",
    role: "admin",
    region: "Oslo",
    stilling: "Daglig leder",
    timelonn: "0",
    available: true,
  }).returning();

  const ansatte = await db.insert(users).values([
    { username: "anna", password: "ansatt123", name: "Anna Kristiansen", email: "anna@nestwork.no", phone: "91234567", role: "ansatt", region: "Oslo", stilling: "Barnehagelærer", timelonn: "285", available: true },
    { username: "erik", password: "ansatt123", name: "Erik Hansen", email: "erik@nestwork.no", phone: "92345678", role: "ansatt", region: "Oslo", stilling: "Assistent", timelonn: "220", available: true },
    { username: "sofie", password: "ansatt123", name: "Sofie Berg", email: "sofie@nestwork.no", phone: "93456789", role: "ansatt", region: "Bergen", stilling: "Barnehagelærer", timelonn: "290", available: true },
    { username: "lars", password: "ansatt123", name: "Lars Pedersen", email: "lars@nestwork.no", phone: "94567890", role: "ansatt", region: "Bergen", stilling: "Fagarbeider", timelonn: "260", available: false },
    { username: "kari", password: "ansatt123", name: "Kari Johansen", email: "kari@nestwork.no", phone: "95678901", role: "ansatt", region: "Trondheim", stilling: "Assistent", timelonn: "215", available: true },
  ]).returning();

  const bh = await db.insert(barnehager).values([
    { name: "Solstråle Barnehage", address: "Sørkedalsveien 12, 0369 Oslo", region: "Oslo", contactPerson: "Lise Andersen", contactPhone: "22334455", contactEmail: "lise@solstraale.no", tariff: "PBL" },
    { name: "Trollskogen Barnehage", address: "Grensen 5, 0159 Oslo", region: "Oslo", contactPerson: "Morten Nilsen", contactPhone: "22445566", contactEmail: "morten@trollskogen.no", tariff: "KS" },
    { name: "Eventyr Barnehage", address: "Karl Johans gate 22, 0026 Oslo", region: "Oslo", contactPerson: "Inger Holm", contactPhone: "22556677", contactEmail: "inger@eventyr.no", tariff: "PBL" },
    { name: "Fjelltoppen Barnehage", address: "Strandgaten 10, 5015 Bergen", region: "Bergen", contactPerson: "Ole Berge", contactPhone: "55112233", contactEmail: "ole@fjelltoppen.no", tariff: "KS" },
    { name: "Havbris Barnehage", address: "Bryggen 3, 5003 Bergen", region: "Bergen", contactPerson: "Nina Strand", contactPhone: "55223344", contactEmail: "nina@havbris.no", tariff: "PBL" },
    { name: "Nordlys Barnehage", address: "Kongens gate 8, 7013 Trondheim", region: "Trondheim", contactPerson: "Per Bakken", contactPhone: "73112233", contactEmail: "per@nordlys.no", tariff: "KS" },
  ]).returning();

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 5);
  const nextWeek2 = new Date(today);
  nextWeek2.setDate(today.getDate() + 6);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  await db.insert(vakter).values([
    { barnehageId: bh[0].id, dato: fmt(tomorrow), startTid: "07:30", sluttTid: "15:30", vikarkode: "KTV", status: "ledig", region: "Oslo", beskrivelse: "Vikar trengs på stor avdeling" },
    { barnehageId: bh[1].id, dato: fmt(tomorrow), startTid: "08:00", sluttTid: "16:00", vikarkode: "LTV", status: "ledig", region: "Oslo", beskrivelse: "Langtidsvikar, 2 uker" },
    { barnehageId: bh[2].id, dato: fmt(dayAfter), startTid: "07:00", sluttTid: "14:00", vikarkode: "KTV", status: "ledig", region: "Oslo", beskrivelse: "Tidligvakt, småbarnsavdeling" },
    { barnehageId: bh[0].id, dato: fmt(nextWeek), startTid: "09:00", sluttTid: "17:00", vikarkode: "RES", status: "venter", ansattId: ansatte[0].id, region: "Oslo", beskrivelse: "Reserve, kan bli avlyst" },
    { barnehageId: bh[3].id, dato: fmt(tomorrow), startTid: "07:30", sluttTid: "15:30", vikarkode: "KTV", status: "ledig", region: "Bergen", beskrivelse: "Vikar for sykemeldt ansatt" },
    { barnehageId: bh[4].id, dato: fmt(dayAfter), startTid: "08:00", sluttTid: "16:00", vikarkode: "LTV-NAV", status: "ledig", region: "Bergen", beskrivelse: "NAV-tiltak, lengre periode" },
    { barnehageId: bh[3].id, dato: fmt(nextWeek2), startTid: "07:00", sluttTid: "15:00", vikarkode: "KTV", status: "godkjent", ansattId: ansatte[2].id, region: "Bergen", beskrivelse: "Fast vikar" },
    { barnehageId: bh[5].id, dato: fmt(tomorrow), startTid: "07:30", sluttTid: "15:30", vikarkode: "KTV", status: "ledig", region: "Trondheim", beskrivelse: "Behov for ekstra hender" },
    { barnehageId: bh[1].id, dato: fmt(yesterday), startTid: "07:30", sluttTid: "15:30", vikarkode: "KTV", status: "godkjent", ansattId: ansatte[0].id, region: "Oslo", beskrivelse: "Fullført vakt" },
    { barnehageId: bh[0].id, dato: fmt(lastWeek), startTid: "08:00", sluttTid: "16:00", vikarkode: "LTV", status: "godkjent", ansattId: ansatte[1].id, region: "Oslo", beskrivelse: "Fullført vakt" },
  ]);

  const onboardingItems = [
    "Politiattest levert",
    "CV lastet opp",
    "Bankinfo registrert",
    "Signert kontrakt",
    "HMS-kurs gjennomført",
    "Profilert bilde lastet opp",
    "Første vakt gjennomført",
  ];
  for (const ansatt of ansatte) {
    for (let i = 0; i < onboardingItems.length; i++) {
      await db.insert(onboarding).values({
        userId: ansatt.id,
        item: onboardingItems[i],
        completed: i < 3,
        completedAt: i < 3 ? new Date() : null,
      });
    }
  }

  await db.insert(meldinger).values([
    { fromUserId: ansatte[0].id, subject: "Spørsmål om lønn", message: "Hei! Jeg lurer på om timelønnen min er oppdatert for dette kvartalet?", read: false },
    { fromUserId: ansatte[1].id, subject: "Syk i morgen", message: "Beklager, men jeg er dessverre syk og kan ikke ta vakten min i morgen.", read: true },
    { fromUserId: ansatte[2].id, subject: "Tilgjengelig hele uken", message: "Hei, jeg er tilgjengelig for vakter hele neste uke. Legg gjerne ut flere vakter i Bergen!", read: false },
  ]);

  console.log("Database seeded successfully!");
}
