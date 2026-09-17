---
name: Isolated browser tests
description: Prevent the service worker from bypassing fixture interception in browser-only checks
---

Block service workers before navigation when running browser checks that depend on intercepting every API request.

**Why:** In an isolated review check, a service worker took control after initial navigation and forwarded later API requests past Playwright routing. Synthetic admin rendering succeeded but subsequent previews reached the unauthenticated backend. Unregistering after navigation did not reliably remove the controller.

**How to apply:** Create the browser context with `serviceWorkers: "block"` before loading the app. Continue aborting unexpected mutations. Distinguish fixture-based UI verification from actual authenticated backend or production verification; never alter production authentication to make an isolated test pass.