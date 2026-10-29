---
name: Native PDF compatibility
description: Why mobile payroll previews need a compatible PDF engine and matching worker
---

Use a PDF engine and worker from the same package version, with legacy browser compatibility for Android WebViews. A successful web build alone does not establish that a PDF can render.

**Why:** A mobile browser test failed on a valid two-page synthetic PDF with the modern PDF.js engine. The legacy engine and matching legacy worker rendered both pages successfully. Separately installed react-pdf and pdfjs-dist dependencies can resolve different versions, so using one engine's worker with the other's API is unsafe.

**How to apply:** Test a synthetic multi-page document in an isolated mobile browser, including pagination, close/reopen, authenticated token-only fetching, and error handling. Keep confidential payroll PDFs on the device; do not use an external online viewer. Native sharing and actual Android push delivery require separate physical-device verification after a native release.
