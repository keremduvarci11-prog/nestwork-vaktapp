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
- **Vakter**: Shifts with status flow: ledig -> venter -> godkjent/avslatt
- **Meldinger**: Conversations between employees and admin (with samtale_meldinger thread messages)
- **Favoritter**: Employee favorite kindergartens
- **Onboarding**: Checklist items for new employees (password change, profile pic, CV, politiattest, bankinfo, contract)

## User Roles
1. **Ansatt (Employee)**: View/claim shifts in their region, track earnings, messaging, onboarding, settings (change password/email/phone/kontonummer/profile picture)
2. **Admin**: Create/edit/delete shifts, approve/reject requests, dashboard overview, messaging, manage all vakter

## Important Routes
- `/api/auth/login` - POST login (supports email or username)
- `/api/auth/me` - GET current user
- `/api/vakter` - GET all shifts (with ?region= filter)
- `/api/vakter/:id/ta` - POST claim a shift
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
- Multi-turn conversation messaging with unread badges
- Admin can close conversations
- Password change with bcrypt hashing
- Profile picture upload
- Google Sheets integration for approved shifts

## Demo Credentials
- All employees start with password: nestwork2026
- Admin: admin / admin123
