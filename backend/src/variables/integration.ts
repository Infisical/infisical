import {
    CLIENT_ID_HEROKU,
    CLIENT_ID_NETLIFY,
    CLIENT_ID_GITHUB,
    CLIENT_SLUG_VERCEL
} from '../config';

// integrations
const INTEGRATION_HEROKU = 'heroku';
const INTEGRATION_VERCEL = 'vercel';
const INTEGRATION_NETLIFY = 'netlify';
const INTEGRATION_GITHUB = 'github';
const INTEGRATION_SET = new Set([
    INTEGRATION_HEROKU,
    INTEGRATION_VERCEL,
    INTEGRATION_NETLIFY,
    INTEGRATION_GITHUB
]);

// integration types
const INTEGRATION_OAUTH2 = 'oauth2';

// integration oauth endpoints
const INTEGRATION_HEROKU_TOKEN_URL = 'https://id.heroku.com/oauth/token';
const INTEGRATION_VERCEL_TOKEN_URL =
    'https://api.vercel.com/v2/oauth/access_token';
const INTEGRATION_NETLIFY_TOKEN_URL = 'https://api.netlify.com/oauth/token';
const INTEGRATION_GITHUB_TOKEN_URL =
    'https://github.com/login/oauth/access_token';

// integration apps endpoints
const INTEGRATION_HEROKU_API_URL = 'https://api.heroku.com';
const INTEGRATION_VERCEL_API_URL = 'https://api.vercel.com';
const INTEGRATION_NETLIFY_API_URL = 'https://api.netlify.com';

const INTEGRATION_OPTIONS = [
    {
        name: 'Heroku',
        slug: 'heroku',
        image: 'Heroku',
        isAvailable: true,
        type: 'oauth2',
        clientId: CLIENT_ID_HEROKU,
        docsLink: ''
    },
    {
        name: 'Vercel',
        slug: 'vercel',
        image: 'Vercel',
        isAvailable: true,
        type: 'vercel',
        clientId: '',
        clientSlug: CLIENT_SLUG_VERCEL,
        docsLink: ''
    },
    {
        name: 'Netlify',
        slug: 'netlify',
        image: 'Netlify',
        isAvailable: true,
        type: 'oauth2',
        clientId: CLIENT_ID_NETLIFY,
        docsLink: ''
    },
    {
        name: 'GitHub',
        slug: 'github',
        image: 'GitHub',
        isAvailable: true,
        type: 'oauth2',
        clientId: CLIENT_ID_GITHUB,
        docsLink: ''

    },
    {
        name: 'Google Cloud Platform',
        slug: 'gcp',
        image: 'Google Cloud Platform',
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Amazon Web Services',
        slug: 'aws',
        image: 'Amazon Web Services',
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Microsoft Azure',
        slug: 'azure',
        image: 'Microsoft Azure',
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Travis CI',
        slug: 'travisci',
        image: 'Travis CI',
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Circle CI',
        slug: 'circleci',
        image: 'Circle CI',
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    }
]

export {
    INTEGRATION_HEROKU,
    INTEGRATION_VERCEL,
    INTEGRATION_NETLIFY,
    INTEGRATION_GITHUB,
    INTEGRATION_SET,
    INTEGRATION_OAUTH2,
    INTEGRATION_HEROKU_TOKEN_URL,
    INTEGRATION_VERCEL_TOKEN_URL,
    INTEGRATION_NETLIFY_TOKEN_URL,
    INTEGRATION_GITHUB_TOKEN_URL,
    INTEGRATION_HEROKU_API_URL,
    INTEGRATION_VERCEL_API_URL,
    INTEGRATION_NETLIFY_API_URL,
    INTEGRATION_OPTIONS
};
