export const PAYROLL_ONBOARDING_ITEM = "Fyll ut lønnsskjema";
export const PAYROLL_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSczmwDoqyUnKAkwPvoXp5IEONJ_XOdM64onODY2-7UK2LRtVA/viewform?pli=1";

export const LEGACY_ONBOARDING_ITEMS = [
  "Bytt passord",
  "Last opp profilbilde",
  "Last opp CV",
  "Last opp politiattest",
  "Signert kontrakt",
];

export const NEW_EMPLOYEE_ONBOARDING_ITEMS = [
  ...LEGACY_ONBOARDING_ITEMS,
  PAYROLL_ONBOARDING_ITEM,
];

// Only the explicitly requested demonstration account gets a retroactive step.
export function isPayrollDemoUser(user: { username: string; role: string }) {
  return user.role === "ansatt" && user.username === "testnestwork";
}
