/**
 * Prime Care Clinic — Global JavaScript Utilities
 * =================================================
 * Navigation, scroll effects, FAQ accordion, form helpers,
 * back-to-top, and shared page functionality.
 */

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initMobileNav();
  initFaqAccordion();
  initBackToTop();
  initSmoothScroll();
  initDisclaimerBanner();
});

/* ── Header scroll effect ─────────────────────────────────────── */
function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  function onScroll() {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ── Mobile navigation ────────────────────────────────────────── */
function initMobileNav() {
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.nav-main');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('open');
    nav.classList.toggle('open');
    document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
  });

  // Handle mobile dropdowns
  const dropdowns = nav.querySelectorAll('.nav-dropdown-toggle');
  dropdowns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (window.innerWidth <= 1024) {
        e.preventDefault();
        btn.closest('.nav-dropdown').classList.toggle('open');
      }
    });
  });

  // Close on nav link click (mobile)
  nav.querySelectorAll('.nav-link, .nav-dropdown-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        toggle.classList.remove('open');
        nav.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  });
}

/* ── FAQ Accordion ────────────────────────────────────────────── */
function initFaqAccordion() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Optionally close others (single-open mode)
      items.forEach(other => other.classList.remove('open'));

      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });
}

/* ── Back to top button ───────────────────────────────────────── */
function initBackToTop() {
  const btn = document.querySelector('.back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ── Smooth scroll for anchor links ───────────────────────────── */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const headerHeight = document.querySelector('.site-header')?.offsetHeight || 0;
        const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });
}

/* ── Disclaimer banner ────────────────────────────────────────── */
function initDisclaimerBanner() {
  const banner = document.querySelector('.disclaimer-banner');
  if (!banner) return;

  const closeBtn = banner.querySelector('.disclaimer-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      banner.style.display = 'none';
    });
  }
}

/* ── Form Validation Utilities ────────────────────────────────── */
const FormValidator = {
  /**
   * Validate a single field
   * Returns error message or null
   */
  validateField(input) {
    const value = input.value.trim();
    const type = input.type;
    const required = input.hasAttribute('required');

    if (required && !value) {
      return 'This field is required.';
    }

    if (value && type === 'tel') {
      const phoneRegex = /^[\+]?[0-9\s\-\(\)]{7,15}$/;
      if (!phoneRegex.test(value)) {
        return 'Please enter a valid phone number.';
      }
    }

    if (value && type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Please enter a valid email address.';
      }
    }

    if (value && type === 'date') {
      const selectedDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        return 'Please select a future date.';
      }

      // Block dates more than 60 days out
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + 60);
      if (selectedDate > maxDate) {
        return 'Please select a date within the next 60 days.';
      }
    }

    return null;
  },

  /**
   * Show field error
   */
  showError(input, message) {
    input.classList.add('error');
    const errorEl = input.closest('.form-group')?.querySelector('.form-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  },

  /**
   * Clear field error
   */
  clearError(input) {
    input.classList.remove('error');
    const errorEl = input.closest('.form-group')?.querySelector('.form-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
    }
  },

  /**
   * Validate entire form
   * Returns true if valid
   */
  validateForm(form) {
    let isValid = true;
    const inputs = form.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
      this.clearError(input);
      const error = this.validateField(input);
      if (error) {
        this.showError(input, error);
        isValid = false;
      }
    });

    // Check consent checkbox
    const consent = form.querySelector('#consent');
    if (consent && !consent.checked) {
      const errorEl = consent.closest('.form-group')?.querySelector('.form-error');
      if (errorEl) {
        errorEl.textContent = 'You must agree to the terms to proceed.';
        errorEl.classList.add('visible');
      }
      isValid = false;
    }

    return isValid;
  }
};

/* ── Appointment API Layer ────────────────────────────────────── */
const AppointmentAPI = {
  mode: 'demo', // 'demo' or 'live'
  endpoint: null,

  init(config) {
    if (config && config.appointments) {
      this.mode = config.appointments.mode || 'demo';
      this.endpoint = config.appointments.apiEndpoint;
    }
  },

  /**
   * Submit appointment request
   * In demo mode, simulates submission without transmitting data
   */
  async submit(formData) {
    if (this.mode === 'demo') {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      return {
        success: true,
        demo: true,
        message: 'Demo mode — Your request has been simulated successfully. In production, this would be sent to the clinic for review. No data was transmitted or stored.'
      };
    }

    // Live mode — send to backend
    if (!this.endpoint) {
      return {
        success: false,
        message: 'Appointment system is not yet configured. Please contact the clinic directly.'
      };
    }

    try {
      const response = await fetch(this.endpoint + '/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Submission failed.');
      }

      return {
        success: true,
        demo: false,
        message: data.message || 'Your appointment request has been submitted. The clinic will contact you to confirm.',
        appointmentId: data.appointmentId
      };
    } catch (err) {
      return {
        success: false,
        message: err.message || 'Unable to submit appointment. Please try again or contact the clinic directly.'
      };
    }
  }
};

// Make utilities globally available
window.FormValidator = FormValidator;
window.AppointmentAPI = AppointmentAPI;
