// integrations
const INTEGRATION_HEROKU = 'heroku';
const INTEGRATION_NETLIFY = 'netlify';
const INTEGRATION_SET = new Set([INTEGRATION_HEROKU, INTEGRATION_NETLIFY]);

// integration types
const INTEGRATION_OAUTH2 = 'oauth2';

// integration oauth endpoints
const OAUTH_TOKEN_URL_HEROKU = 'https://id.heroku.com/oauth/token';

export {
    INTEGRATION_HEROKU,
    INTEGRATION_NETLIFY,
    INTEGRATION_SET,
    INTEGRATION_OAUTH2,
    OAUTH_TOKEN_URL_HEROKU
}