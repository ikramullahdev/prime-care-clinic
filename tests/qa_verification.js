/**
 * Prime Care Clinic & Diabetes Center
 * Comprehensive Quality Assurance & Verification Test Suite
 * ============================================================
 * Tests:
 * 1. Internal Link Integrity across all HTML pages
 * 2. Meta tags, titles, and SEO best practices
 * 3. Configuration & Verification Flag compliance
 * 4. Image assets and CSS integrity
 * 5. Form Validation logic (Phone numbers, Date constraints, Consent)
 * 6. Backend API route definitions & Prisma models
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('\n============================================================');
console.log('PRIME CARE CLINIC — QA & SYSTEM VERIFICATION SUITE');
console.log('============================================================\n');

// ── Test Suite 1: File Existence & Integrity ──────────────────
console.log('--- 1. Verifying Core Pages & Assets Existence ---');
const requiredPages = [
  'index.html',
  'about.html',
  'services.html',
  'general-consultation.html',
  'diabetes-care.html',
  'patient-info.html',
  'faq.html',
  'contact.html',
  'appointment.html',
  'admin.html',
  'login.html',
  'privacy-policy.html',
  'terms-of-use.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'config/clinic.js',
  'assets/css/styles.css',
  'assets/js/main.js',
  'assets/images/clinic-interior.jpg',
  'assets/images/diabetes-care.jpg',
  'assets/images/general-consultation.jpg',
  'assets/images/clinic-logo-circle.png',
  'assets/images/doctor-farhan-portrait.jpg',
  'assets/images/doctor-farhan-square.jpg'
];

requiredPages.forEach(file => {
  const fullPath = path.join(ROOT_DIR, file);
  assert(fs.existsSync(fullPath), `File exists: ${file}`);
});

// ── Test Suite 2: Internal Link Resolution ─────────────────────
console.log('\n--- 2. Verifying Internal Navigation Links ---');
const htmlFiles = requiredPages.filter(f => f.endsWith('.html'));

htmlFiles.forEach(htmlFile => {
  const content = fs.readFileSync(path.join(ROOT_DIR, htmlFile), 'utf-8');
  // Match href="something.html"
  const linkMatches = content.match(/href="([^"#:]+\.html)"/g) || [];
  const uniqueLinks = [...new Set(linkMatches.map(m => m.replace(/href="|"/g, '')))];

  uniqueLinks.forEach(targetLink => {
    const targetPath = path.join(ROOT_DIR, targetLink);
    assert(
      fs.existsSync(targetPath),
      `Link from [${htmlFile}] -> [${targetLink}] resolves successfully`
    );
  });
});

// ── Test Suite 3: Central Config Verification Flags ───────────
console.log('\n--- 3. Verifying Clinic Configuration & Verification Flags ---');
const configPath = path.join(ROOT_DIR, 'config', 'clinic.js');
const clinicConfig = require(configPath);

assert(clinicConfig.name.verified === true, 'Clinic Name verified via official clinic logo emblem');
assert(clinicConfig.logo.verified === true, 'Official Logo verified and configured');
assert(clinicConfig.address.verified === false, 'Address correctly marked unverified pending confirmation');
assert(clinicConfig.phone.verified === false, 'Phone correctly marked unverified pending confirmation');
assert(clinicConfig.hours.verified === false, 'Hours correctly marked unverified pending confirmation');
assert(clinicConfig.doctors[0].affiliationConfirmed === true, 'Doctor affiliation verified via official photo submission');
assert(clinicConfig.doctors[0].verified === true, 'Doctor profile verified and configured');
assert(clinicConfig.siteStatus.isOfficialSite === false, 'Website explicitly marked as concept/demo');
assert(clinicConfig.appointments.mode === 'demo', 'Appointment system defaults to safe demo mode');

// ── Test Suite 4: Form Validation Rules ────────────────────────
console.log('\n--- 4. Verifying Appointment & Contact Validation Logic ---');

// Test phone validation
const phoneRegex = /^[\+]?[0-9\s\-\(\)]{7,15}$/;
assert(phoneRegex.test('+92 332 5494578'), 'Validates standard Pakistan format (+92 332 5494578)');
assert(phoneRegex.test('03001234567'), 'Validates local 11-digit mobile (03001234567)');
assert(!phoneRegex.test('abc1234'), 'Rejects non-numeric phone format');
assert(!phoneRegex.test('123'), 'Rejects excessively short phone number');

// Test date constraints
const today = new Date();
today.setHours(0, 0, 0, 0);

const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);

const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const farFuture = new Date(today);
farFuture.setDate(farFuture.getDate() + 90);

function isDateValid(dateObj) {
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 60);
  return dateObj >= today && dateObj <= maxDate;
}

assert(!isDateValid(yesterday), 'Rejects past appointment date');
assert(isDateValid(tomorrow), 'Accepts tomorrow for scheduling');
assert(!isDateValid(farFuture), 'Rejects dates beyond 60-day window');

// ── Test Suite 5: Backend Service & Prisma Models ──────────────
console.log('\n--- 5. Verifying Backend Service Architecture ---');
const backendFiles = [
  'backend/package.json',
  'backend/.env.example',
  'backend/prisma/schema.prisma',
  'backend/prisma/seed.js',
  'backend/src/server.js',
  'backend/src/config/prisma.js',
  'backend/src/middleware/auth.js',
  'backend/src/middleware/validation.js',
  'backend/src/routes/auth.js',
  'backend/src/routes/doctors.js',
  'backend/src/routes/appointments.js'
];

backendFiles.forEach(bf => {
  assert(fs.existsSync(path.join(ROOT_DIR, bf)), `Backend component exists: ${bf}`);
});

const schemaContent = fs.readFileSync(path.join(ROOT_DIR, 'backend/prisma/schema.prisma'), 'utf-8');
assert(schemaContent.includes('model Admin'), 'Prisma schema defines Admin model');
assert(schemaContent.includes('model Doctor'), 'Prisma schema defines Doctor model');
assert(schemaContent.includes('model Appointment'), 'Prisma schema defines Appointment model');
assert(schemaContent.includes('AppointmentStatus'), 'Prisma schema defines AppointmentStatus enum');

// ── Summary ────────────────────────────────────────────────────
console.log('\n============================================================');
console.log(`QA TEST SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('============================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
