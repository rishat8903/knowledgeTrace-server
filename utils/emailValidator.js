/**
 * Email Domain Validator
 * Validates that user emails belong to allowed university domains
 */

/**
 * Get allowed email domains from environment variables
 * @returns {string[]} Array of allowed domains
 */
const getAllowedDomains = () => {
  const domainsEnv = process.env.ALLOWED_EMAIL_DOMAINS || 'ugrad.iiuc.ac.bd';
  return domainsEnv.split(',').map(domain => domain.trim().toLowerCase());
};

/**
 * Check if an email belongs to an allowed university domain
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email is from allowed domain, false otherwise
 */
const isUniversityEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailLower = email.toLowerCase().trim();
  const allowedDomains = getAllowedDomains();

  // Check if email ends with any of the allowed domains
  return allowedDomains.some(domain => {
    // Extract domain from email
    const emailDomain = emailLower.split('@')[1];
    
    if (!emailDomain) {
      return false;
    }

    // Handle both exact match and wildcard domains
    // e.g., "ugrad.iiuc.ac.bd" or ".edu"
    if (domain.startsWith('.')) {
      // Wildcard domain: email must end with this domain
      return emailDomain.endsWith(domain) || emailDomain === domain.substring(1);
    } else {
      // Exact domain match
      return emailDomain === domain;
    }
  });
};

/**
 * Get a user-friendly error message for invalid emails
 * @returns {string} Error message
 */
const getInvalidEmailMessage = () => {
  const allowedDomains = getAllowedDomains();
  
  if (allowedDomains.length === 1) {
    return `Only university student emails are allowed. Please use your @${allowedDomains[0]} email address.`;
  }
  
  const domainList = allowedDomains.join(', @');
  return `Only university student emails are allowed. Please use one of: @${domainList}`;
};

/**
 * Validate email and return result with error message
 * @param {string} email - Email to validate
 * @returns {object} { isValid: boolean, message?: string }
 */
const validateUniversityEmail = (email) => {
  const isValid = isUniversityEmail(email);
  
  if (!isValid) {
    return {
      isValid: false,
      message: getInvalidEmailMessage()
    };
  }
  
  return {
    isValid: true
  };
};

module.exports = {
  isUniversityEmail,
  validateUniversityEmail,
  getInvalidEmailMessage,
  getAllowedDomains
};
