import { db } from "./db";
import { users, barnehager, onboarding } from "@shared/schema";

function makeUsername(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
}

export async function seedDatabase() {
  const existingUsers = await db.select().from(users);
  if (existingUsers.length > 0) return;

  await db.insert(users).values({
    username: "admin",
    password: "admin123",
    name: "Nestwork Admin",
    email: "post@nestwork.no",
    phone: "465 30 651",
    role: "admin",
    region: "Alle",
    stilling: "Daglig leder",
    timelonn: "0",
    available: true,
    status: "Aktiv",
  });

  const ansatteData = [
    { externalId: 9001, name: "Eivor Modal", phone: "484 44 990", email: "eivormodal@gmail.com", address: "Bergensveien 1", region: "Bergen", stilling: "Barnehagelærer" },
    { externalId: 9002, name: "Michael David Valderrama", phone: "465 33 894", email: "michael.david.valderrama1@gmail.com", address: "Øyro 57, 5200 Os", region: "Os", stilling: "Barnehagelærer" },
    { externalId: 9003, name: "Anna Furre Hvid", phone: "480 21 547", email: "annafurrehvid@gmail.com", address: "Vågedalsveien 43, 4020 Stavanger", region: "Stavanger", stilling: "Barnehageassistent" },
    { externalId: 9004, name: "Vilja Haraldsen", phone: "948 36 418", email: "Vilhar06@gmail.com", address: "", region: "Fredrikstad", stilling: "Barnehageassistent" },
    { externalId: 9005, name: "Sultan Duvarci", phone: "969 71 700", email: "sultanduvarci@hotmail.com", address: "", region: "Os", stilling: "Barnehageassistent" },
    { externalId: 9006, name: "Ikram Ouhadou", phone: "412 23 076", email: "ikrouh1@gmail.com", address: "", region: "Os", stilling: "Barnehageassistent" },
    { externalId: 9007, name: "Lucas Stokkeland Sandvik", phone: "969 75 254", email: "lucstosan@icloud.com", address: "", region: "Bryne", stilling: "Barnehageassistent" },
    { externalId: 9008, name: "Roza Mohammed Alyoussef", phone: "412 90 693", email: "kemsho06@gmail.com", address: "", region: "Os", stilling: "Barnehageassistent" },
    { externalId: 9009, name: "Duaa Mulki Saleh", phone: "486 53 565", email: "Duaasaleh890@gmail.com", address: "", region: "Os", stilling: "Barnehageassistent" },
    { externalId: 9010, name: "Maria Kristine Jusnes Dahl", phone: "994 00 279", email: "Mariakjd@gmail.com", address: "", region: "Bergen", stilling: "Barnehageassistent" },
    { externalId: 9011, name: "Tuva Bratli", phone: "960 25 574", email: "tuvabratli@gmail.com", address: "", region: "Fredrikstad", stilling: "Barnehageassistent" },
    { externalId: 9012, name: "Maren Monsø", phone: "947 41 413", email: "marenmoso@gmail.com", address: "", region: "Trondheim", stilling: "Barnehageassistent" },
    { externalId: 9013, name: "Sunniva Bosnes Nielsen", phone: "400 22 367", email: "sunnivabosnesnielsen@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9014, name: "Sofie Johansen Andersen", phone: "988 81 710", email: "sofiieander@gmail.com", address: "", region: "Fredrikstad", stilling: "Barnehageassistent" },
    { externalId: 9015, name: "Atisak Lunloet", phone: "939 53 505", email: "atisaklunloet@gmail.com", address: "", region: "Oslo", stilling: "Barnehageassistent" },
    { externalId: 9016, name: "Olai Skaar", phone: "979 71 618", email: "olai.skaar@gmail.com", address: "", region: "Bergen", stilling: "Barnehageassistent" },
    { externalId: 9017, name: "Tora Bugge Ramsøy", phone: "479 35 757", email: "tora.ramsoy@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9018, name: "Birgitte Hansen", phone: "958 00 618", email: "birgittelingehansen@gmail.com", address: "", region: "Trondheim", stilling: "Barnehageassistent" },
    { externalId: 9019, name: "Angelica Valderrama David", phone: "412 62 805", email: "angelicavalderrama7@gmail.com", address: "", region: "Os", stilling: "Barnehageassistent" },
    { externalId: 9020, name: "Marita Grønnestad Gangstø", phone: "913 83 629", email: "Maritagangsto@gmail.com", address: "", region: "Haugesund", stilling: "Barnehageassistent" },
    { externalId: 9021, name: "Sunniva Lekve", phone: "478 85 037", email: "sunnivalekve@outlook.com", address: "", region: "Bergen", stilling: "Barnehageassistent" },
    { externalId: 9022, name: "Nada Ismail Layna", phone: "411 55 618", email: "nadalayna4@gmail.com", address: "", region: "Bergen", stilling: "Barnehageassistent" },
    { externalId: 9023, name: "Emma Sellevoll", phone: "454 09 218", email: "emma.sellevoll@gmail.com", address: "", region: "Bergen", stilling: "Barnehageassistent" },
    { externalId: 9024, name: "Maren Kristine Alvær", phone: "411 55 105", email: "marenk.2k5@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9025, name: "Bibi Zulaikha Ragbar", phone: "486 15 440", email: "bibizulaikhar@gmail.com", address: "", region: "Os", stilling: "Barnehageassistent" },
    { externalId: 9026, name: "Amy Øien", phone: "938 81 606", email: "amyoein@icloud.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9027, name: "Younes Boundjenah", phone: "465 45 523", email: "Yboundjenah27@gmail.com", address: "", region: "Stord", stilling: "Barnehageassistent" },
    { externalId: 9028, name: "Veslemøy Vedå Ivarsøy", phone: "484 45 510", email: "moyveda5@gmail.com", address: "", region: "Stord", stilling: "Barnehageassistent" },
    { externalId: 9029, name: "Sakar Melik Amin", phone: "932 95 019", email: "sazan482@gmail.com", address: "", region: "Bergen", stilling: "Barnehageassistent" },
    { externalId: 9030, name: "Nina Sofie Harutunyan", phone: "926 95 800", email: "nina.harutunyan05@gmail.com", address: "", region: "Drammen", stilling: "Barnehageassistent" },
    { externalId: 9031, name: "Kaja Celine Selbo", phone: "979 40 037", email: "carlsenkaja@gmail.com", address: "", region: "Drammen", stilling: "Barnehageassistent" },
    { externalId: 9032, name: "Elvina Qorraj", phone: "941 60 510", email: "ElvinaQorraj@hotmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9033, name: "Hedil El-Kazemi", phone: "479 07 447", email: "06hedil@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9034, name: "Sanne Kristin Aarbakke", phone: "479 38 410", email: "sanneaarbakke@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9035, name: "Daniel Amiri", phone: "476 76 800", email: "behnam.rad@yahoo.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9036, name: "Yara Moustafa", phone: "962 13 893", email: "ymoustafa4@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9037, name: "Tea Erlandsson", phone: "486 97 556", email: "erlandssontea@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9038, name: "Esther Kristiansen", phone: "909 36 929", email: "esthekri@online.no", address: "", region: "Stord", stilling: "Barnehageassistent" },
    { externalId: 9039, name: "Helge Kulberg", phone: "479 91 792", email: "helgekulberg@proton.me", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9040, name: "Lina Engevik Vørøs", phone: "400 14 770", email: "linavoros05@gmail.com", address: "", region: "Stord", stilling: "Barnehageassistent" },
    { externalId: 9041, name: "Andrine Shikoswe Jahren", phone: "966 09 218", email: "andrine.s.j@icloud.com", address: "", region: "Drammen", stilling: "Barnehageassistent" },
    { externalId: 9042, name: "Selin Ceylan", phone: "485 77 006", email: "ceylanselinn06@gmail.com", address: "", region: "Bergen", stilling: "Barnehageassistent" },
    { externalId: 9043, name: "Mariekje Zebra Boysen", phone: "479 67 800", email: "truezebra33@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9044, name: "Trine Stakseng", phone: "994 48 889", email: "trine.stakseng.stord@gmail.com", address: "", region: "Stord", stilling: "Barnehageassistent" },
    { externalId: 9046, name: "Ida Benedicte Munkvold", phone: "988 07 800", email: "idabenedictemunkvold@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
    { externalId: 9047, name: "Sofie Erdal", phone: "474 66 048", email: "sofieerdal78@gmail.com", address: "", region: "Bergen", stilling: "Barnehageassistent" },
    { externalId: 9048, name: "Amanda Frederich", phone: "412 79 536", email: "13amanda.frederich@gmail.com", address: "", region: "Fusa", stilling: "Barnehageassistent" },
    { externalId: 9049, name: "Sarah Phosa Eftestad", phone: "979 95 536", email: "sarah.eftes@gmail.com", address: "", region: "Kristiansand", stilling: "Barnehageassistent" },
  ];

  const usedUsernames = new Set<string>();
  for (const a of ansatteData) {
    let uname = makeUsername(a.name);
    if (usedUsernames.has(uname)) {
      uname = uname + a.externalId;
    }
    usedUsernames.add(uname);

    await db.insert(users).values({
      username: uname,
      password: "nestwork2026",
      name: a.name,
      email: a.email,
      phone: a.phone,
      address: a.address,
      role: "ansatt",
      region: a.region,
      stilling: a.stilling,
      timelonn: "0",
      available: true,
      availableWeekend: false,
      status: "Aktiv",
      externalId: a.externalId,
    });
  }

  await db.insert(barnehager).values([
    { externalId: "A001", name: "Skorvane Fus Barnehage", address: "Skeismyra 14, 5217 Hagavik", region: "Os", contactPerson: "Kristin Tellefsen", contactPhone: "902 19 798", tariffAssistent: "207", tariffLaerer: "250", orgnr: "927 311 097", aktiv: true },
    { externalId: "A002", name: "Hjellemarka Fus Barnehage", address: "Storestraumen 275, 5212 Søfteland", region: "Os", contactPerson: "Birte Strømsø", contactPhone: "954 24 405", tariffAssistent: "207", tariffLaerer: "250", orgnr: "927 308 754", aktiv: true },
    { externalId: "A003", name: "Rakkungan Barnehagedrift AS", address: "Kirsebærveien 10A, 4635 Kristiansand", region: "Kristiansand", contactPerson: "Monica Tanche Bergh Ahlstrøm", contactPhone: "971 31 108", orgnr: "996 501 884", aktiv: true },
    { externalId: "A004", name: "Rakkerungan Gårdbarnehage AS", address: "Støleveien 21, 4639 Kristiansand", region: "Kristiansand", contactPerson: "Monica Tanche Bergh Ahlstrøm", contactPhone: "971 31 108", orgnr: "930 696 552", aktiv: true },
    { externalId: "A005", name: "Jegersberg Barnehage", address: "Gillsveien 45, 4633 Kristiansand", region: "Kristiansand", contactPerson: "Monica Tanche Bergh Ahlstrøm", contactPhone: "971 31 108", orgnr: "998 282 225", aktiv: true },
    { externalId: "A006", name: "Søre Neset Fus Barnehage", address: "Reset 32, 5200 Os", region: "Os", contactPerson: "Edle Nøkleby", contactPhone: "415 88 670", tariffAssistent: "207", tariffLaerer: "250", orgnr: "922 043 639", aktiv: true },
    { externalId: "A007", name: "Håkonshella Fus Barnehage", address: "Håkonshellaveien 125, 5174 Bergen", region: "Bergen", contactPerson: "Gro Seberg", contactPhone: "483 99 222", tariffAssistent: "207", tariffLaerer: "250", orgnr: "922 042 993", aktiv: true },
    { externalId: "A008", name: "Prestagardskogen Fus Barnehage", address: "Vestlivegen 40, 5414 Stord", region: "Stord", contactPerson: "Anne Kristin Aaseth / Lillian", contactPhone: "416 81 108 / 486 08 162", tariffAssistent: "207", tariffLaerer: "250", orgnr: "916 072 848", aktiv: true },
    { externalId: "A009", name: "Tyse Fus Barnehage", address: "Tysemarkjo 47, 5414 Stord", region: "Stord", contactPerson: "Anne Kristin Aaseth / Lillian", contactPhone: "417 81 108 / 486 08 162", tariffAssistent: "207", tariffLaerer: "250", orgnr: "927 311 232", aktiv: true },
    { externalId: "A010", name: "Jettegryto Barnehage", address: "Brakabygda 49, 5640 Eikelandsosen", region: "Stord", contactPerson: "Line Ragnhildstveit", contactPhone: "482 65 55", orgnr: "994 735 284", aktiv: true },
  ]);

  const allUsers = await db.select().from(users);
  const ansatte = allUsers.filter(u => u.role === "ansatt");

  const onboardingItems = [
    "Bytt passord",
    "Last opp profilbilde",
    "Last opp CV",
    "Last opp politiattest",
    "Registrer bankinfo",
    "Signert kontrakt",
  ];

  for (const ansatt of ansatte) {
    for (const item of onboardingItems) {
      await db.insert(onboarding).values({
        userId: ansatt.id,
        item,
        completed: false,
      });
    }
  }

  console.log(`Database seeded: ${ansatte.length} ansatte, 10 barnehager, ${ansatte.length * onboardingItems.length} onboarding items`);
}
