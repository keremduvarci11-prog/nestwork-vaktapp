import assert from "node:assert/strict";
import test from "node:test";
import { LEGACY_ONBOARDING_ITEMS, NEW_EMPLOYEE_ONBOARDING_ITEMS, PAYROLL_ONBOARDING_ITEM, PAYROLL_FORM_URL, isPayrollDemoUser } from "./onboarding";

test("new employees get exactly one payroll task, legacy defaults do not", () => {
  assert.equal(LEGACY_ONBOARDING_ITEMS.includes(PAYROLL_ONBOARDING_ITEM), false);
  assert.equal(NEW_EMPLOYEE_ONBOARDING_ITEMS.filter(item => item === PAYROLL_ONBOARDING_ITEM).length, 1);
  assert.equal(new Set(NEW_EMPLOYEE_ONBOARDING_ITEMS).size, NEW_EMPLOYEE_ONBOARDING_ITEMS.length);
});

test("only the explicit employee demonstration account gets retroactive payroll task", () => {
  assert.equal(isPayrollDemoUser({ username: "testnestwork", role: "ansatt" }), true);
  assert.equal(isPayrollDemoUser({ username: "testnestwork", role: "admin" }), false);
  assert.equal(isPayrollDemoUser({ username: "existing-employee", role: "ansatt" }), false);
});

test("payroll form uses the supplied HTTPS Google Forms URL without personal prefill", () => {
  const url = new URL(PAYROLL_FORM_URL);
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "docs.google.com");
  assert.equal(url.pathname, "/forms/d/e/1FAIpQLSczmwDoqyUnKAkwPvoXp5IEONJ_XOdM64onODY2-7UK2LRtVA/viewform");
  assert.deepEqual([...url.searchParams.keys()], ["pli"]);
});
