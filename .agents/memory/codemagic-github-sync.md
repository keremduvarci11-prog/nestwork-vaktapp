---
name: Codemagic/GitHub build pipeline gotchas
description: Why Codemagic mobile builds fail even when the Replit code is fine
---

# Codemagic builds happen from the GitHub remote, not Replit

The mobile (Android/iOS) builds run on Codemagic, cloning `github.com/keremduvarci11-prog/nestwork-vaktapp` `main`. Replit is the source of truth (production web app deploys from here).

**Rules:**
- After any change in Replit that should reach mobile builds, push to the `github` remote (`git push github main:main`). If GitHub diverges (other tools committing there), a diverged snapshot exists at branch `backup-pre-sync-2026-07-30`; Replit main was force-pushed over it on 2026-07-30.
- `package-lock.json` written inside Replit can contain `http://package-firewall.replit.local/npm/...` resolved URLs, which break `npm ci` outside Replit. codemagic.yaml sanitizes them with sed before `npm ci`; keep that step.
- Vite 7 requires Node >= 20.19; codemagic.yaml pins `node: 20.20.0` for Android.
- Android push was previously disabled after Firebase startup crashes. On 2026-09-22 the user explicitly required normal Android phone notifications, superseding the iOS-only decision. Enable FCM only with valid Firebase client configuration; never ship a binary that silently omits it. Older installed Android binaries lack the push plugin, so web publishing alone cannot enable their push.

**How to apply:** Preserve compatibility with older Android binaries while preparing the new release. Require Firebase configuration from the same project for client and server, and verify physical-device delivery before describing Android push as operational. Native configuration/plugin changes require a new Android binary; do not confuse passing web builds with native verification.

**Why:** Google Play rejected the app for startup crashes (Firebase auto-init without config); Codemagic builds repeatedly failed at "Build web assets" because GitHub main was a stale diverged copy missing files, then because of the firewall URLs in the lockfile.
