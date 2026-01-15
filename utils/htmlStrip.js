/**
 * HTML Stripping Utility
 * Removes HTML tags and entities from strings for validation
 */

/**
 * Strip HTML tags and decode HTML entities from a string
 * @param {string} html - The HTML string to strip
 * @returns {string} - Plain text content
 */
function stripHtml(html) {
    if (!html || typeof html !== 'string') {
        return '';
    }

    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, '');
    
    // Decode common HTML entities
    const entities = {
        '&nbsp;': ' ',
        '&lt;': '<',
        '&gt;': '>',
        '&amp;': '&',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
    };
    
    Object.entries(entities).forEach(([entity, char]) => {
        text = text.replace(new RegExp(entity, 'g'), char);
    });
    
    // Remove excessive whitespace and trim
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
}

/**
 * Get the plain text length from HTML content
 * @param {string} html - The HTML string
 * @returns {number} - Length of plain text content
 */
function getPlainTextLength(html) {
    return stripHtml(html).length;
}

module.exports = {
    stripHtml,
    getPlainTextLength,
};
