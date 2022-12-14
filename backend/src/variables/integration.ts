// integrations
const INTEGRATION_HEROKU = 'heroku';
const INTEGRATION_VERCEL = 'vercel';
const INTEGRATION_NETLIFY = 'netlify';
const INTEGRATION_SET = new Set([
    INTEGRATION_HEROKU, 
    INTEGRATION_VERCEL, 
    INTEGRATION_NETLIFY
]);

// integration types
const INTEGRATION_OAUTH2 = 'oauth2';

// integration oauth endpoints
const INTEGRATION_HEROKU_TOKEN_URL = 'https://id.heroku.com/oauth/token';
const INTEGRATION_VERCEL_TOKEN_URL = 'https://api.vercel.com/v2/oauth/access_token';
const INTEGRATION_NETLIFY_TOKEN_URL = 'https://api.netlify.com/oauth/token';

// integration apps endpoints
const INTEGRATION_HEROKU_API_URL = 'https://api.heroku.com';
const INTEGRATION_VERCEL_API_URL = 'https://api.vercel.com';
const INTEGRATION_NETLIFY_API_URL = 'https://api.netlify.com';

export {
    INTEGRATION_HEROKU,
    INTEGRATION_VERCEL,
    INTEGRATION_NETLIFY,
    INTEGRATION_SET,
    INTEGRATION_OAUTH2,
    INTEGRATION_HEROKU_TOKEN_URL,
    INTEGRATION_VERCEL_TOKEN_URL,
    INTEGRATION_NETLIFY_TOKEN_URL,
    INTEGRATION_HEROKU_API_URL,
    INTEGRATION_VERCEL_API_URL,
    INTEGRATION_NETLIFY_API_URL,
}