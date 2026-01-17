// User model/schema for MongoDB with RBAC and enhanced features
class User {
  constructor(data = {}) {
    this.uid = data.uid || ''; // Firebase UID
    this.email = data.email || '';
    this.name = data.name || data.displayName || '';
    this.displayName = data.displayName || data.name || '';
    this.photoURL = data.photoURL || '';
    this.department = data.department || '';
    this.year = data.year || '';
    this.skills = data.skills || []; // For team matching (Module C)
    this.github = data.github || '';
    this.linkedin = data.linkedin || '';
    this.bio = data.bio || '';
    this.headline = data.headline || '';
    this.socialLinks = data.socialLinks || {
      github: data.github || '',
      linkedin: data.linkedin || '',
      website: data.website || ''
    };

    // RBAC fields
    this.role = data.role || 'student'; // 'student' | 'supervisor' | 'admin'
    this.isAdmin = data.isAdmin || false; // Legacy, kept for backward compatibility

    // Supervisor-specific fields
    this.designation = data.designation || ''; // Professor, Associate Professor, etc.
    this.researchAreas = data.researchAreas || []; // Research interests for matching
    this.maxStudents = data.maxStudents || null; // Optional limit on supervised students
    this.officeHours = data.officeHours || ''; // Office hours for students
    this.supervisedProjects = data.supervisedProjects || []; // Array of project IDs

    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  /**
   * Validates if email is from authorized IIUC domain
   * @param {string} email - Email to validate
   * @returns {boolean}
   */
  static validateEmail(email) {
    // Allow both student and supervisor domains
    const allowedDomains = ['@ugrad.iiuc.ac.bd', '@iiuc.ac.bd'];
    return allowedDomains.some(domain => email.toLowerCase().endsWith(domain));
  }

  /**
   * Checks if user has a specific role
   * @param {string|string[]} allowedRoles - Role(s) to check against
   * @returns {boolean}
   */
  hasRole(allowedRoles) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return roles.includes(this.role);
  }

  /**
   * Checks if user is a supervisor
   * @returns {boolean}
   */
  isSupervisor() {
    return this.role === 'supervisor';
  }

  toJSON() {
    return {
      uid: this.uid,
      email: this.email,
      name: this.name,
      displayName: this.displayName,
      photoURL: this.photoURL,
      department: this.department,
      year: this.year,
      skills: Array.isArray(this.skills) ? this.skills : (this.skills ? this.skills.split(',').map(s => s.trim()) : []),
      github: this.github,
      linkedin: this.linkedin,
      bio: this.bio,
      headline: this.headline,
      socialLinks: this.socialLinks,
      role: this.role,
      isAdmin: this.isAdmin,
      designation: this.designation,
      researchAreas: this.researchAreas,
      maxStudents: this.maxStudents,
      officeHours: this.officeHours,
      supervisedProjects: this.supervisedProjects,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = User;


