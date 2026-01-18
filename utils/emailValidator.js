/**
 * Email Domain Validator
 * Validates that user emails belong to allowed university domains
 * Supports both student (@ugrad.iiuc.ac.bd) and supervisor (@iiuc.ac.bd) emails
 */

/**
 * Check if an email is a student email
 * @param {string} email - Email address to validate
 * @returns {boolean} True if studentemail
 */
const isStudentEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailLower = email.toLowerCase().trim();
  return emailLower.endsWith('@ugrad.iiuc.ac.bd');
};

/**
 * Check if an email is a supervisor/faculty email
 * @param {string} email - Email address to validate
 * @returns {boolean} True if supervisor email
 */
const isSupervisorEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailLower = email.toLowerCase().trim();
  // Faculty emails end with @iiuc.ac.bd but NOT @ugrad.iiuc.ac.bd
  return emailLower.endsWith('@iiuc.ac.bd') && !emailLower.endsWith('@ugrad.iiuc.ac.bd');
};

/**
 * Check if an email belongs to an allowed university domain
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email is from allowed domain, false otherwise
 */
const isUniversityEmail = (email) => {
  return isStudentEmail(email) || isSupervisorEmail(email);
};

/**
 * Get role from email domain
 * @param {string} email - Email address
 * @returns {string|null} 'student', 'supervisor', or null
 */
const getRoleFromEmail = (email) => {
  if (isStudentEmail(email)) {
    return 'student';
  } else if (isSupervisorEmail(email)) {
    return 'supervisor';
  }
  return null;
};

/**
 * Get allowed email domains
 * @returns {string[]} Array of allowed domains
 */
const getAllowedDomains = () => {
  return ['ugrad.iiuc.ac.bd', 'iiuc.ac.bd'];
};

/**
 * Get a user-friendly error message for invalid emails
 * @returns {string} Error message
 */
const getInvalidEmailMessage = () => {
  return 'Only university emails are allowed. Students must use @ugrad.iiuc.ac.bd and supervisors/faculty must use @iiuc.ac.bd (not @ugrad.iiuc.ac.bd)';
};

/**
 * Validate email and return result with error message
 * @param {string} email - Email to validate
 * @returns {object} { isValid: boolean, message?: string, role?: string }
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
    isValid: true,
    role: getRoleFromEmail(email)
  };
};

module.exports = {
  isUniversityEmail,
  isStudentEmail,
  isSupervisorEmail,
  getRoleFromEmail,
  validateUniversityEmail,
  getInvalidEmailMessage,
  getAllowedDomains
};
