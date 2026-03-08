# Nestwork Vaktapp

## Overview
Shift management application for Nestwork - a staffing agency for kindergartens (barnehager) in Norway. Employees can view and claim available shifts in their region, while admins manage shifts and approve requests.

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js with session-based authentication
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (client-side), Express (server-side)

## Key Data Models
- **Users**: Employees and admins with region, position, hourly rate
- **Barnehager**: Kindergartens with contact info and tariff
- **Vakter**: Shifts with status flow: ledig → venter → godkjent/avslått
- **Meldinger**: Messages between employees and management
- **Favoritter**: Employee favorite kindergartens
- **Onboarding**: Checklist items for new employees

## User Roles
1. **Ansatt (Employee)**: View/claim shifts in their region, track earnings, messaging, onboarding
2. **Admin**: Create shifts, approve/reject requests, dashboard overview, read messages

## Important Routes
- `/api/auth/login` - POST login
- `/api/auth/me` - GET current user
- `/api/vakter` - GET all shifts (with ?region= filter)
- `/api/vakter/:id/ta` - POST claim a shift
- `/api/vakter/:id/godkjenn` - POST approve shift
- `/api/vakter/:id/avslaa` - POST reject shift

## Design
- Mobile-first with bottom navigation
- Green primary color (Nestwork branding, HSL 142 76% 36%)
- Norwegian language UI
- Max-width container (max-w-lg) for mobile optimization

## Demo Credentials
- Employee: anna / ansatt123
- Admin: admin / admin123
