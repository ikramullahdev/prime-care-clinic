# Prime Care Clinic & Diabetes Center — Production Healthcare Website & Appointment Architecture

> **Notice:** This project is an independent concept website and appointment management system designed for **Prime Care Clinic & Diabetes Center**, Main Tulsa Road, Lalazar, Rawalpindi Cantt, Pakistan. Unverified clinic details are explicitly tagged and kept in demonstration mode until authorized by clinic leadership.

---

## 1. Project Overview & Architecture

This repository delivers a comprehensive, production-grade healthcare web presence and appointment scheduling system. It features:
- **Design System:** Bespoke vanilla CSS architecture adhering to medical color psychology (Deep Navy `#0b2545`, Healing Teal `#0f8181`, crisp clinical whites, and accessible warm accents).
- **Multi-Page Website:** 10 fully articulated pages with semantic HTML5, accessible micro-interactions, responsive grids, and evidence-informed medical educational copy.
- **Appointment Management Frontend:** Validated multi-step appointment booking interface with both interactive demo simulation and live API integration layers.
- **Administrative Portal:** Protected staff management console with KPI metrics, status filters, date selectors, reschedule modals, and doctor schedule management.
- **Backend Service (`/backend`):** High-performance Node.js / Express service using Prisma ORM with PostgreSQL, role-based JWT authentication, duplicate booking conflict detection, and strict server-side validation.

---

## 2. Directory Structure

```
d:\prime care clinic\
├── index.html                   # Clinic homepage (hero, services, visit steps, FAQs, hours)
├── about.html                   # Clinical philosophy, patient-centered care, practice standards
├── services.html                # Medical services overview directory
├── general-consultation.html    # Primary care, acute illness, hypertension, health screening
├── diabetes-care.html           # Type 1/2 diabetes, HbA1c monitoring, lifestyle & nutrition
├── patient-info.html            # Pre-visit instructions, what to bring, visit checklist
├── faq.html                     # 15 categorized medical and administrative FAQs
├── contact.html                 # Location directions, reported hours, map pin, inquiry form
├── appointment.html             # Multi-field validated appointment booking request
├── admin.html                   # Staff login, appointment management console, roster stats
├── privacy-policy.html          # Patient data confidentiality & healthcare security terms
├── terms-of-use.html            # Healthcare disclaimer, emergency notice, booking terms
├── 404.html                     # Missing page fallback with recovery navigation
├── robots.txt                   # Search engine crawl directives
├── sitemap.xml                  # Canonical XML sitemap
│
├── config/
│   └── clinic.js                # Centralized configuration with verification flags
│
├── assets/
│   ├── css/
│   │   └── styles.css           # Complete design tokens, responsive typography, UI components
│   ├── js/
│   │   └── main.js              # Header scroll, mobile menu, accordion, form validator, API layer
│   └── images/
│       ├── clinic-interior.jpg      # High-resolution clinic reception & consultation room
│       ├── diabetes-care.jpg        # Blood glucose monitoring & patient education visual
│       └── general-consultation.jpg # Stethoscope consultation & clinical assessment visual
│
└── backend/                     # Full Appointment Management Architecture
    ├── package.json             # Express, Prisma, PostgreSQL, bcryptjs, JWT, CORS
    ├── .env.example             # Documented environment variables
    ├── .env                     # Local configuration
    ├── prisma/
    │   ├── schema.prisma        # Database models (Admin, Doctor, Appointment)
    │   └── seed.js              # Database seed script (Admin user, Doctor, baseline appointments)
    └── src/
        ├── server.js            # Express application bootstrap & CORS
        ├── config/
        │   └── prisma.js        # Prisma client singleton
        ├── middleware/
        │   ├── auth.js          # JWT verification & role-based access control
        │   └── validation.js    # Strict server-side request validation
        └── routes/
            ├── auth.js          # Admin login & session verification
            ├── doctors.js       # Doctor roster & schedule availability
            └── appointments.js  # Booking requests, duplicate check, status transitions, reschedule
```

---

## 3. Central Configuration & Verification Philosophy

All operational data is centralized in [`config/clinic.js`](file:///d:/prime%20care%20clinic/config/clinic.js). Per the strict accuracy mandate:
- **No unverified claims:** Unverified telephone numbers, doctor affiliations, and operating hours are explicitly marked with `verified: false` and accompanied by visual warning badges.
- **Independent Concept Declaration:** Prominent banners inform patients that this is an independent concept/demo until officially commissioned by clinic management.
- **Emergency Disclaimer:** Prominently directs urgent cases to Rescue 1122 or hospital emergency departments (e.g. CMH Rawalpindi).

---

## 4. Appointment System Architecture

### Frontend Layer
- In **Demo Mode** (`CLINIC_CONFIG.appointments.mode = 'demo'`), forms validate inputs, verify booking rules, and simulate successful submissions locally without transmitting patient data.
- In **Live Mode** (`CLINIC_CONFIG.appointments.mode = 'live'`), requests are transmitted via `AppointmentAPI.submit()` to the backend REST API.

### Backend Layer (`/backend`)
- **Availability:** `GET /api/doctors/:doctorId/availability?date=YYYY-MM-DD` returns schedule-valid, unreserved slots for one active doctor.
- **Duplicate Booking Prevention:** PostgreSQL's `appointments_active_slot_key` partial unique index protects `(doctorId, appointmentDate, slotStart)` while status is `PENDING` or `CONFIRMED`. The API returns HTTP 409 on slot conflicts; `CANCELLED` and `COMPLETED` rows do not reserve slots.
- **Server-Side Validation:** Validates doctor, patient details, consent, date range, slot format, and doctor schedule for booking, rescheduling, and cancelled-appointment reactivation.
- **Data Protection:** Passwords are encrypted with `bcrypt` (10 rounds). Protected routes require `Bearer <JWT>` tokens.

---

#### Appointment tests
- `npm test` runs unit and mocked API tests; mocked tests do not establish database concurrency protection.
- Actual PostgreSQL integration tests are opt-in. Set `TEST_DATABASE_URL` to a reviewed, dedicated local database whose name ends in `_test`. Inspect that database before proceeding, then direct Prisma migrations to that same test database and run the PostgreSQL tests:
  ```powershell
  # Stop any backend process using this test database before migration.
  $env:DATABASE_URL = $env:TEST_DATABASE_URL
  npx prisma migrate deploy
  npm run test:appointments:postgres
  ```
- The integration suite creates and removes only its synthetic test doctor and appointment rows. It never resets or seeds the test database. Database-level concurrency is verified only by a passing PostgreSQL integration run.

## 5. Local Setup & Execution Guide (PowerShell)

### Step 1: Frontend Static Server
The static frontend can be served using any local HTTP server:
```powershell
# Using Python
cd "d:\prime care clinic"
python -m http.server 3000

# OR using npx serve
npx -y serve -l 3000
```
- Public Homepage: `http://localhost:3000/index.html`
- Appointment Request: `http://localhost:3000/appointment.html`
- Admin Dashboard: `http://localhost:3000/admin.html`

### Step 2: Backend & Database Setup
```powershell
cd "d:\prime care clinic\backend"

# 1. Install dependencies
npm install

# 2. Configure DATABASE_URL only after confirming it points to a dedicated
#    local development database. Never point migration or seed commands at
#    production or a database containing real patient records.

# 3. Generate Prisma client & apply the checked-in migration history
npx prisma generate
npx prisma migrate deploy

# 4. Optional: seed demo records in the dedicated local database only
node prisma/seed.js

# 5. Start the backend API server
npm run dev
```

### Initial Administrator Credentials
- **Email:** `admin@primecare.pk`
- **Password:** `AdminPrimeCare2026!`
- **API Endpoint:** `http://localhost:5000/api`
- **Health Check:** `http://localhost:5000/api/health`

---

## 6. Verification Status Checklist

| Data Field | Reported Value | Verification Status | Action Needed |
| :--- | :--- | :---: | :--- |
| Clinic Name | Prime Care Clinic & Diabetes Center | ⚠️ Pending Confirmation | Confirm official trade name |
| Street Address | Main Tulsa Road, Lalazar, Rawalpindi Cantt | ⚠️ Pending Confirmation | Confirm exact plaza/building number |
| Phone Number | +92 332 5494578 | ⚠️ Directory Listing Only | Obtain direct clinic telephone confirmation |
| Operating Hours | Mon–Thu/Sat 5:30–10 PM, Fri 5–10 PM | ⚠️ Reported Discrepancy | Verify actual reception timings |
| Doctor In-Charge | Dr. Muhammad Farhan Khan | ⚠️ Unconfirmed Affiliation | Confirm PMDC/PMC registration & credentials |
| Official Socials | Facebook / Instagram | ⚠️ Not verified | Acquire official handles |
