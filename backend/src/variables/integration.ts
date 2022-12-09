// integrations
const INTEGRATION_HEROKU = 'heroku';
const INTEGRATION_NETLIFY = 'netlify';
const INTEGRATION_SET = new Set([INTEGRATION_HEROKU, INTEGRATION_NETLIFY]);

// integration types
const INTEGRATION_OAUTH2 = 'oauth2';

// integration oauth endpoints
const INTEGRATION_HEROKU_TOKEN_URL = 'https://id.heroku.com/oauth/token';

// integration apps endpoints
const INTEGRATION_HEROKU_APPS_URL = 'https://api.heroku.com/apps';

export {
    INTEGRATION_HEROKU,
    INTEGRATION_NETLIFY,
    INTEGRATION_SET,
    INTEGRATION_OAUTH2,
    INTEGRATION_HEROKU_TOKEN_URL,
    INTEGRATION_HEROKU_APPS_URL
}