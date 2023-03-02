import {
    CLIENT_ID_AZURE,
    CLIENT_ID_GITLAB
} from '../config';
import {
  CLIENT_ID_HEROKU,
  CLIENT_ID_NETLIFY,
  CLIENT_ID_GITHUB,
  CLIENT_SLUG_VERCEL
} from "../config";

// integrations
const INTEGRATION_AZURE_KEY_VAULT = 'azure-key-vault';
const INTEGRATION_AWS_PARAMETER_STORE = 'aws-parameter-store';
const INTEGRATION_AWS_SECRET_MANAGER = 'aws-secret-manager';
const INTEGRATION_HEROKU = "heroku";
const INTEGRATION_VERCEL = "vercel";
const INTEGRATION_NETLIFY = "netlify";
const INTEGRATION_GITHUB = "github";
const INTEGRATION_GITLAB = "gitlab";
const INTEGRATION_RENDER = "render";
const INTEGRATION_FLYIO = "flyio";
const INTEGRATION_CIRCLECI = "circleci";
const INTEGRATION_TRAVISCI = "travisci";
const INTEGRATION_SET = new Set([
    INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_GITLAB,
  INTEGRATION_RENDER,
  INTEGRATION_FLYIO,
  INTEGRATION_CIRCLECI,
  INTEGRATION_TRAVISCI,
]);

// integration types
const INTEGRATION_OAUTH2 = "oauth2";

// integration oauth endpoints
const INTEGRATION_AZURE_TOKEN_URL = `https://login.microsoftonline.com/common/oauth2/v2.0/token`;
const INTEGRATION_HEROKU_TOKEN_URL = 'https://id.heroku.com/oauth/token';
const INTEGRATION_VERCEL_TOKEN_URL =
  "https://api.vercel.com/v2/oauth/access_token";
const INTEGRATION_NETLIFY_TOKEN_URL = "https://api.netlify.com/oauth/token";
const INTEGRATION_GITHUB_TOKEN_URL =
  "https://github.com/login/oauth/access_token";
const INTEGRATION_GITLAB_TOKEN_URL = "https://gitlab.com/oauth/token";


// integration apps endpoints
const INTEGRATION_HEROKU_API_URL = "https://api.heroku.com";
const INTEGRATION_GITLAB_API_URL = "https://gitlab.com/api";
const INTEGRATION_VERCEL_API_URL = "https://api.vercel.com";
const INTEGRATION_NETLIFY_API_URL = "https://api.netlify.com";
const INTEGRATION_RENDER_API_URL = "https://api.render.com";
const INTEGRATION_FLYIO_API_URL = "https://api.fly.io/graphql";
const INTEGRATION_CIRCLECI_API_URL = "https://circleci.com/api";
const INTEGRATION_TRAVISCI_API_URL = "https://api.travis-ci.com";

const INTEGRATION_OPTIONS = [
    {
        name: 'Heroku',
        slug: 'heroku',
        image: 'Heroku.png',
        isAvailable: true,
        type: 'oauth',
        clientId: CLIENT_ID_HEROKU,
        docsLink: ''
    },
    {
        name: 'Vercel',
        slug: 'vercel',
        image: 'Vercel.png',
        isAvailable: true,
        type: 'oauth',
        clientId: '',
        clientSlug: CLIENT_SLUG_VERCEL,
        docsLink: ''
    },
    {
        name: 'Netlify',
        slug: 'netlify',
        image: 'Netlify.png',
        isAvailable: true,
        type: 'oauth',
        clientId: CLIENT_ID_NETLIFY,
        docsLink: ''
    },
    {
        name: 'GitHub',
        slug: 'github',
        image: 'GitHub.png',
        isAvailable: true,
        type: 'oauth',
        clientId: CLIENT_ID_GITHUB,
        docsLink: ''
    },
    {
        name: 'Render',
        slug: 'render',
        image: 'Render.png',
        isAvailable: true,
        type: 'pat',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Fly.io',
        slug: 'flyio',
        image: 'Flyio.svg',
        isAvailable: true,
        type: 'pat',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'AWS Parameter Store',
        slug: 'aws-parameter-store',
        image: 'Amazon Web Services.png',
        isAvailable: true,
        type: 'custom',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'AWS Secret Manager',
        slug: 'aws-secret-manager',
        image: 'Amazon Web Services.png',
        isAvailable: true,
        type: 'custom',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Azure Key Vault',
        slug: 'azure-key-vault',
        image: 'Microsoft Azure.png',
        isAvailable: true,
        type: 'oauth',
        clientId: CLIENT_ID_AZURE,
        docsLink: ''
    },
    {
        name: 'Circle CI',
        slug: 'circleci',
        image: 'Circle CI.png',
        isAvailable: true,
        type: 'pat',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'GitLab',
        slug: 'gitlab',
        image: 'GitLab.png',
        isAvailable: true,
        type: 'oauth',
        clientId: CLIENT_ID_GITLAB, 
        docsLink: ''
    },
    {
        name: 'Travis CI',
        slug: 'travisci',
        image: 'Travis CI.png',
        isAvailable: true,
        type: 'pat',
        clientId: '',
        docsLink: ''
    },
    {
        name: 'Google Cloud Platform',
        slug: 'gcp',
        image: 'Google Cloud Platform.png',
        isAvailable: false,
        type: '',
        clientId: '',
        docsLink: ''
    }
]

export {
    INTEGRATION_AZURE_KEY_VAULT,
    INTEGRATION_AWS_PARAMETER_STORE,
    INTEGRATION_AWS_SECRET_MANAGER,
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_GITLAB,
  INTEGRATION_RENDER,
  INTEGRATION_FLYIO,
  INTEGRATION_CIRCLECI,
  INTEGRATION_TRAVISCI,
  INTEGRATION_SET,
  INTEGRATION_OAUTH2,
    INTEGRATION_AZURE_TOKEN_URL,
  INTEGRATION_HEROKU_TOKEN_URL,
  INTEGRATION_VERCEL_TOKEN_URL,
  INTEGRATION_NETLIFY_TOKEN_URL,
  INTEGRATION_GITHUB_TOKEN_URL,
  INTEGRATION_GITLAB_API_URL,
  INTEGRATION_HEROKU_API_URL,
  INTEGRATION_GITLAB_TOKEN_URL,
  INTEGRATION_VERCEL_API_URL,
  INTEGRATION_NETLIFY_API_URL,
  INTEGRATION_RENDER_API_URL,
  INTEGRATION_FLYIO_API_URL,
  INTEGRATION_CIRCLECI_API_URL,
  INTEGRATION_TRAVISCI_API_URL,
  INTEGRATION_OPTIONS,
};
