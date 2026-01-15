// Test Joi custom validator
const Joi = require('joi');

const stripHtml = (html) => {
    if (!html || typeof html !== 'string') {
        return '';
    }
    let text = html.replace(/<[^>]*>/g, '');
    text = text.replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
    return text.replace(/\s+/g, ' ').trim();
};

const testSchema = Joi.object({
    abstract: Joi.string()
        .required()
        .custom((value, helpers) => {
            const plainText = stripHtml(value);
            console.log('Value:', value);
            console.log('Plain text:', plainText);
            console.log('Plain text length:', plainText.length);

            if (plainText.length < 50) {
                return helpers.error('string.min', { limit: 50, length: plainText.length });
            }
            if (value.length > 5000) {
                return helpers.error('string.max', { limit: 5000 });
            }
            return value;
        })
        .messages({
            'string.empty': 'Project abstract is required',
            'string.min': 'Abstract must be at least {#limit} characters long (currently {#length} characters)',
            'string.max': 'Abstract must not exceed {#limit} characters',
        }),
});

// Test cases
console.log('\n=== Test 1: Short plain text ===');
const test1 = testSchema.validate({ abstract: 'Short text' });
console.log('Result:', test1.error ? test1.error.message : 'VALID');

console.log('\n=== Test 2: Long plain text ===');
const test2 = testSchema.validate({ abstract: 'This is a long enough abstract that should pass validation because it has more than fifty characters total.' });
console.log('Result:', test2.error ? test2.error.message : 'VALID');

console.log('\n=== Test 3: HTML content with short plain text ===');
const test3 = testSchema.validate({ abstract: '<p>Short</p>' });
console.log('Result:', test3.error ? test3.error.message : 'VALID');

console.log('\n=== Test 4: HTML content with long plain text ===');
const test4 = testSchema.validate({ abstract: '<p>wiuefyy wubwucbwu qwhcbwucbu huwbuwcbuw hubwuhbwuhbwc.</p>' });
console.log('Result:', test4.error ? test4.error.message : 'VALID');
