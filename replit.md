# Nestwork Vaktapp

## Overview
Shift management application for Nestwork - a staffing agency for kindergartens (barnehager) in Norway. Employees can view and claim available shifts in their region, while admins manage shifts and approve requests.

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js with session-based authentication
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (client-side), Express (server-side)
- **Auth**: bcrypt password hashing (supports legacy plain-text for migration)
- **File uploads**: multer for profile images (/uploads/profiles) and documents (/uploads/documents)
- **Google Sheets**: Auto-appends approved shifts via integration

## Key Data Models
- **Users**: Employees and admins with region, position, hourly rate, kontonummer, profileImage, cvFile, politiattestFile
- **Barnehager**: Kindergartens with contact info and tariff
- **Vakter**: Shifts with status flow: ledig -> venter -> godkjent/avslatt, or ledig -> tildelt -> godkjent (admin direct assignment). Has `trekkPause` boolean for 30-min lunch deduction.
- **Meldinger**: Conversations between employees and admin (with samtale_meldinger thread messages)
- **Favoritter**: Employee favorite kindergartens
- **Onboarding**: Checklist items for new employees (password change, profile pic, CV, politiattest, bankinfo, contract)

## User Roles
1. **Ansatt (Employee)**: View/claim shifts in their region, track earnings, messaging, onboarding, settings (change password/email/phone/kontonummer/profile picture)
2. **Admin**: Create/edit/delete shifts, approve/reject requests, assign shifts directly to employees (tildel), dashboard overview, messaging, manage all vakter

## Important Routes
- `/api/auth/login` - POST login (supports email or username)
- `/api/auth/me` - GET current user
- `/api/vakter` - GET all shifts (with ?region= filter)
- `/api/vakter/:id/ta` - POST claim a shift (uses session userId)
- `/api/vakter/:id/tildel` - POST admin assigns shift to employee
- `/api/vakter/:id/godta` - POST employee accepts assigned shift
- `/api/vakter/:id/godkjenn` - POST approve shift
- `/api/vakter/:id/avslaa` - POST reject shift
- `DELETE /api/vakter/:id` - DELETE a shift (admin)
- `PATCH /api/vakter/:id` - Update shift details (admin)
- `/api/users/:id/change-password` - POST change password
- `/api/users/:id/profile-image` - POST upload profile picture
- `/api/users/:id/upload-cv` - POST upload CV document
- `/api/users/:id/upload-politiattest` - POST upload police certificate
- `/api/meldinger/unread-count/admin` - GET unread message count for admin
- `/api/meldinger/unread-count/user/:userId` - GET unread message count for employee

## Design
- Mobile-first with bottom navigation
- Dark teal/petroleum primary color (HSL 180 57% 24%, ~#1a5f5f)
- Norwegian language UI throughout
- Max-width container (max-w-lg) for mobile optimization
- Real Nestwork logo (transparent PNG)
- Vikarkoder hidden from employees, visible to admin and Google Sheet

## Key Features
- Bergen region sees both Bergen + Os shifts (regionGroups mapping)
- Admin can assign shifts directly to employees ("tildelt" status); employee sees and accepts ("Godta vakt")
- Multi-turn conversation messaging with unread badges
- Admin can close/reopen/delete conversations; employees can hide conversations
- Password change with bcrypt hashing
- Profile picture upload (clickable avatar on profil page, camera icon overlay)
- Admin avatar shows Nestwork logo; employees show initials or uploaded photo
- CV and politiattest document upload (auth-protected)
- Google Sheets integration for approved shifts (with pause deduction in timer)
- Inntjening shows NOK currency (not dollar sign)
- 30-minute pause toggle on shifts (trekkPause) deducts from paid hours everywhere
- Admin can search/select employee directly when creating new shift (auto-assigns as tildelt)
- Push notifications (Web Push API with VAPID keys + service worker)
- In-app notification system (varsler table) with bell icon in header showing unread count
- Cron jobs: 2hr ledig-vakt reminder, 1hr tildelt-purring, 20:00 evening reminder for next-day shifts
- Notification triggers: new vakt (region), tildeling (employee), admin message (employee)
- Dark mode with three options: Lys/Mørk/Automatisk (localStorage "nestwork-theme"), ThemeProvider wraps app
- Employee bottom nav: Onboarding tab (replaces Lønn) with circular progress ring
- Admin "Ansattes onboarding" page: search employees, view progress, download documents

## Demo Credentials
- All employees start with password: nestwork2026
- Admin: admin / admin123
