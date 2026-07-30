#!/bin/bash
set -e

# Install any new/changed dependencies (fast no-op when lockfile unchanged)
npm install

# Apply database schema changes (drizzle), non-interactive
npm run db:push --if-present -- --force
