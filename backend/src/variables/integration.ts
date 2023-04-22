import {
    getClientIdHeroku,
    getClientSlugVercel,
    getClientIdNetlify,
    getClientIdAzure,
    getClientIdGitLab,
    getClientIdGitHub,
    getClientIdGCPSecretManager
} from '../config';

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
const INTEGRATION_RAILWAY = "railway";
const INTEGRATION_FLYIO = "flyio";
const INTEGRATION_CIRCLECI = "circleci";
const INTEGRATION_GCP_SECRET_MANAGER = 'gcp-secret-manager';
const INTEGRATION_TRAVISCI = "travisci";
const INTEGRATION_SUPABASE = 'supabase';
const INTEGRATION_SET = new Set([
    INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_GITLAB,
  INTEGRATION_RENDER,
  INTEGRATION_FLYIO,
    INTEGRATION_HEROKU,
    INTEGRATION_VERCEL,
    INTEGRATION_NETLIFY,
    INTEGRATION_GITHUB,
    INTEGRATION_RENDER,
    INTEGRATION_FLYIO,
  INTEGRATION_CIRCLECI,
  INTEGRATION_GCP_SECRET_MANAGER,
  INTEGRATION_TRAVISCI,
  INTEGRATION_SUPABASE
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
const INTEGRATION_GCP_TOKEN_URL = "https://accounts.google.com/o/oauth2/token"

// integration apps endpoints
const INTEGRATION_HEROKU_API_URL = "https://api.heroku.com";
const INTEGRATION_GITLAB_API_URL = "https://gitlab.com/api";
const INTEGRATION_VERCEL_API_URL = "https://api.vercel.com";
const INTEGRATION_NETLIFY_API_URL = "https://api.netlify.com";
const INTEGRATION_RENDER_API_URL = "https://api.render.com";
const INTEGRATION_RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2";
const INTEGRATION_FLYIO_API_URL = "https://api.fly.io/graphql";
const INTEGRATION_CIRCLECI_API_URL = "https://circleci.com/api";
const INTEGRATION_GCP_API_URL = "https://cloudresourcemanager.googleapis.com";
const INTEGRATION_GCP_SERVICE_USAGE_API_URL = "https://serviceusage.googleapis.com";
const INTEGRATION_GCP_SECRET_MANAGER_URL = "https://secretmanager.googleapis.com"
const INTEGRATION_GCP_SM_SERVICE_NAME = "secretmanager.googleapis.com"
const INTEGRATION_TRAVISCI_API_URL = "https://api.travis-ci.com";
const INTEGRATION_SUPABASE_API_URL = 'https://api.supabase.com';

const getIntegrationOptions = () => {
    const INTEGRATION_OPTIONS = [
        {
            name: 'Heroku',
            slug: 'heroku',
            image: 'Heroku.png',
            isAvailable: true,
            type: 'oauth',
            clientId: getClientIdHeroku(),
            docsLink: ''
        },
        {
            name: 'Vercel',
            slug: 'vercel',
            image: 'Vercel.png',
            isAvailable: true,
            type: 'oauth',
            clientId: '',
            clientSlug: getClientSlugVercel(),
            docsLink: ''
        },
        {
            name: 'Netlify',
            slug: 'netlify',
            image: 'Netlify.png',
            isAvailable: true,
            type: 'oauth',
            clientId: getClientIdNetlify(),
            docsLink: ''
        },
        {
            name: 'GitHub',
            slug: 'github',
            image: 'GitHub.png',
            isAvailable: true,
            type: 'oauth',
            clientId: getClientIdGitHub(),
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
            name: 'Railway',
            slug: 'railway',
            image: 'Railway.png',
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
            clientId: getClientIdAzure(),
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
            type: 'custom',
            clientId: getClientIdGitLab(),
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
            name: 'Supabase',
            slug: 'supabase',
            image: 'Supabase.png',
            isAvailable: true,
            type: 'pat',
            clientId: '',
            docsLink: ''
        },
        {
            name: 'GCP Secret Manager',
            slug: 'gcp-secret-manager',
            image: 'Google Cloud Platform.png',
            isAvailable: true,
            type: 'oauth',
            clientId: getClientIdGCPSecretManager(),
            docsLink: ''
        }
    ]
    
    return INTEGRATION_OPTIONS;
}


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
    INTEGRATION_RAILWAY,
    INTEGRATION_FLYIO,
    INTEGRATION_CIRCLECI,
    INTEGRATION_TRAVISCI,
    INTEGRATION_SUPABASE,
    INTEGRATION_SET,
    INTEGRATION_OAUTH2,
    INTEGRATION_AZURE_TOKEN_URL,
    INTEGRATION_HEROKU_TOKEN_URL,
    INTEGRATION_VERCEL_TOKEN_URL,
    INTEGRATION_NETLIFY_TOKEN_URL,
    INTEGRATION_GITHUB_TOKEN_URL,
    INTEGRATION_GCP_TOKEN_URL,
    INTEGRATION_GITLAB_API_URL,
    INTEGRATION_HEROKU_API_URL,
    INTEGRATION_GITLAB_TOKEN_URL,
    INTEGRATION_VERCEL_API_URL,
    INTEGRATION_NETLIFY_API_URL,
    INTEGRATION_RENDER_API_URL,
    INTEGRATION_RAILWAY_API_URL,
    INTEGRATION_FLYIO_API_URL,
    INTEGRATION_CIRCLECI_API_URL,
    INTEGRATION_TRAVISCI_API_URL,
    INTEGRATION_GCP_API_URL,
    INTEGRATION_GCP_SECRET_MANAGER,
    INTEGRATION_GCP_SECRET_MANAGER_URL,
    INTEGRATION_GCP_SERVICE_USAGE_API_URL,
    INTEGRATION_GCP_SM_SERVICE_NAME,
    INTEGRATION_SUPABASE_API_URL,
    getIntegrationOptions
};
