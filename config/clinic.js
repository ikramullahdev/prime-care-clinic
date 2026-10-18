/**
 * Prime Care Clinic — Central Configuration
 * ============================================
 * All clinic information is managed here.
 * Each field has a `verified` flag. Only verified information
 * should be displayed as confirmed facts on the website.
 *
 * IMPORTANT: Update verification flags only after the clinic
 * has officially confirmed the information.
 */

const CLINIC_CONFIG = {
  // ── Identity ──────────────────────────────────────────────
  name: {
    short: "Prime Care Clinic",
    full: "Prime Care Clinic & Diabetes Center",
    verified: true, // Confirmed by official clinic logo emblem ("PCC - PRIME CARE CLINIC")
  },

  // ── Official Logo ──────────────────────────────────────────
  logo: {
    src: "assets/images/clinic-logo-circle.png",
    fullSrc: "assets/images/clinic-logo.png",
    favicon: "assets/images/favicon.png",
    verified: true, // Official logo provided by clinic
  },

  // ── Tagline ───────────────────────────────────────────────
  tagline: "Comprehensive Healthcare & Specialized Diabetes Management",

  // ── Location ──────────────────────────────────────────────
  address: {
    line1: "Main Tulsa Road",
    line2: "Lalazar, Rawalpindi Cantt",
    city: "Rawalpindi",
    province: "Punjab",
    country: "Pakistan",
    verified: false, // Address from directory listing, not officially confirmed
  },

  // ── Contact ───────────────────────────────────────────────
  phone: {
    display: "+92 332 5494578",
    href: "tel:+923325494578",
    verified: false, // Listed in a directory; not confirmed by clinic
  },

  email: {
    display: null,
    verified: false,
  },

  // ── Operating Hours ───────────────────────────────────────
  hours: {
    schedule: [
      { days: "Monday – Thursday", time: "5:30 PM – 10:00 PM" },
      { days: "Friday", time: "5:00 PM – 10:00 PM" },
      { days: "Saturday", time: "5:30 PM – 10:00 PM" },
      { days: "Sunday", time: "Closed" },
    ],
    verified: false, // Reported hours may differ between listings
  },

  // ── Doctor / Staff ────────────────────────────────────────
  doctors: [
    {
      name: "Dr. Muhammad Farhan Khan",
      title: "Consulting Physician & Diabetologist",
      specialty: "General Medicine & Diabetes Management",
      bio: "Dedicated physician providing patient-centered primary care consultations, preventive health screenings, and specialized ongoing management for diabetes patients in Rawalpindi.",
      photo: "assets/images/doctor-farhan-portrait.jpg",
      photoSquare: "assets/images/doctor-farhan-square.jpg",
      affiliationConfirmed: true, // Confirmed by official clinic submission
      verified: true,
    },
  ],

  // ── Social & Web ──────────────────────────────────────────
  social: {
    facebook: { url: null, verified: false },
    instagram: { url: null, verified: false },
    website: { url: null, verified: false },
  },

  // ── Appointment System ────────────────────────────────────
  appointments: {
    enabled: true,
    mode: "demo", // "demo" | "live"  — Demo mode does NOT transmit data
    apiEndpoint: null, // Set when backend is deployed
    verified: false,
  },

  // ── Website Status ────────────────────────────────────────
  siteStatus: {
    isOfficialSite: false, // NOT authorized as official website
    disclaimer:
      "This website is an independent concept/demo and is not the official website of Prime Care Clinic. Information presented may require verification.",
  },

  // ── Map Embed ─────────────────────────────────────────────
  map: {
    // Generic coordinates for Lalazar, Rawalpindi Cantt area
    lat: 33.5879,
    lng: 73.0640,
    embedUrl: null, // Add Google Maps embed URL when available
    verified: false,
  },

  // ── Services ──────────────────────────────────────────────
  services: {
    verified: [
      "General Physician Consultations",
      "Diabetes Care & Management",
    ],
    unverified: [], // Do not add services without clinic confirmation
  },
};

// Make available globally for frontend
if (typeof window !== "undefined") {
  window.CLINIC_CONFIG = CLINIC_CONFIG;
}

// Make available for Node.js backend
if (typeof module !== "undefined" && module.exports) {
  module.exports = CLINIC_CONFIG;
}
