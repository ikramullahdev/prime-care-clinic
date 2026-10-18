/**
 * Prime Care Clinic — Phone Number Normalization Utility
 * Cleans and standardizes phone numbers for duplicate checking and consistency.
 */

function normalizePhone(phoneStr) {
  if (!phoneStr || typeof phoneStr !== 'string') return '';
  
  // Remove all spaces, dashes, parens, and slashes
  let cleaned = phoneStr.replace(/[\s\-\(\)\/\.]/g, '');

  // If starts with 0092, replace with +92
  if (cleaned.startsWith('0092')) {
    cleaned = '+92' + cleaned.substring(4);
  }
  // If starts with 92 without +, add +
  else if (cleaned.startsWith('92') && cleaned.length >= 12) {
    cleaned = '+' + cleaned;
  }
  // Standardize Pakistani mobile prefix (e.g. 03xx to +923xx)
  else if (cleaned.startsWith('03') && cleaned.length === 11) {
    cleaned = '+92' + cleaned.substring(1);
  }

  return cleaned;
}

function formatPhoneDisplay(phoneStr) {
  if (!phoneStr) return '';
  const norm = normalizePhone(phoneStr);
  
  // Format +92 332 5494578
  if (norm.startsWith('+92') && norm.length === 13) {
    return `${norm.substring(0, 3)} ${norm.substring(3, 6)} ${norm.substring(6)}`;
  }
  return norm;
}

module.exports = {
  normalizePhone,
  formatPhoneDisplay,
};
