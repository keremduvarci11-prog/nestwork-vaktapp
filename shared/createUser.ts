import { z } from "zod";

const requiredText = (label: string) =>
  z.string({ required_error: `${label} må fylles ut` }).trim().min(1, `${label} må fylles ut`);

const moneySchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const text = typeof value === "number" ? String(value) : value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Timelønn må være et gyldig beløp med maks to desimaler" });
    return z.NEVER;
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > 99_999_999.99) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Timelønn må være mellom 0 og 99999999,99" });
    return z.NEVER;
  }
  return amount.toFixed(2);
});

export const createUserRequestSchema = z.object({
  name: requiredText("Navn"),
  email: requiredText("E-post").email("E-postadressen er ugyldig"),
  phone: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  region: requiredText("Region"),
  stilling: requiredText("Stilling"),
  externalId: z.number().int("Ansattnummer må være et heltall").positive("Ansattnummer må være positivt").max(2147483647, "Ansattnummeret er for stort").optional(),
  timelonn: moneySchema,
  password: z.string({ required_error: "Passord må fylles ut" })
    .min(12, "Passord må være minst 12 tegn")
    .refine((password) => new TextEncoder().encode(password).byteLength <= 72, "Passord kan ikke være lengre enn 72 byte"),
  role: z.enum(["ansatt", "admin"]).optional().default("ansatt"),
  username: z.string().trim().min(1, "Brukernavn kan ikke være tomt").optional(),
}).strict();

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;