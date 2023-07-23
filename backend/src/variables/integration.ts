import {
    getClientIdAzure,
    getClientIdBitBucket,
    getClientIdGitHub,
    getClientIdGitLab,
    getClientIdHeroku,
    getClientIdNetlify,
    getClientSlugVercel,
} from "../config";

// integrations
export const INTEGRATION_AZURE_KEY_VAULT = "azure-key-vault";
export const INTEGRATION_AWS_PARAMETER_STORE = "aws-parameter-store";
export const INTEGRATION_AWS_SECRET_MANAGER = "aws-secret-manager";
export const INTEGRATION_HEROKU = "heroku";
export const INTEGRATION_VERCEL = "vercel";
export const INTEGRATION_NETLIFY = "netlify";
export const INTEGRATION_GITHUB = "github";
export const INTEGRATION_GITLAB = "gitlab";
export const INTEGRATION_RENDER = "render";
export const INTEGRATION_RAILWAY = "railway";
export const INTEGRATION_FLYIO = "flyio";
export const INTEGRATION_LARAVELFORGE = "laravel-forge"
export const INTEGRATION_CIRCLECI = "circleci";
export const INTEGRATION_TRAVISCI = "travisci";
export const INTEGRATION_SUPABASE = "supabase";
export const INTEGRATION_CHECKLY = "checkly";
export const INTEGRATION_HASHICORP_VAULT = "hashicorp-vault";
export const INTEGRATION_CLOUDFLARE_PAGES = "cloudflare-pages";
export const INTEGRATION_BITBUCKET = "bitbucket";
export const INTEGRATION_CODEFRESH = "codefresh";
export const INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM = "digital-ocean-app-platform";
export const INTEGRATION_CLOUD_66 = "cloud-66";
export const INTEGRATION_SET = new Set([
    INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_HEROKU,
  INTEGRATION_VERCEL,
  INTEGRATION_NETLIFY,
  INTEGRATION_GITHUB,
  INTEGRATION_GITLAB,
  INTEGRATION_RENDER,
  INTEGRATION_FLYIO,
  INTEGRATION_CIRCLECI,
  INTEGRATION_LARAVELFORGE,
  INTEGRATION_TRAVISCI,
  INTEGRATION_SUPABASE,
  INTEGRATION_CHECKLY,
  INTEGRATION_HASHICORP_VAULT,
  INTEGRATION_CLOUDFLARE_PAGES,
  INTEGRATION_BITBUCKET,
  INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM,
  INTEGRATION_CODEFRESH,
  INTEGRATION_CLOUD_66
]);

// integration types
export const INTEGRATION_OAUTH2 = "oauth2";

// integration oauth endpoints
export const INTEGRATION_AZURE_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const INTEGRATION_HEROKU_TOKEN_URL = "https://id.heroku.com/oauth/token";
export const INTEGRATION_VERCEL_TOKEN_URL =
  "https://api.vercel.com/v2/oauth/access_token";
export const INTEGRATION_NETLIFY_TOKEN_URL = "https://api.netlify.com/oauth/token";
export const INTEGRATION_GITHUB_TOKEN_URL =
  "https://github.com/login/oauth/access_token";
export const INTEGRATION_GITLAB_TOKEN_URL = "https://gitlab.com/oauth/token";
export const INTEGRATION_BITBUCKET_TOKEN_URL = "https://bitbucket.org/site/oauth2/access_token"

// integration apps endpoints
export const INTEGRATION_HEROKU_API_URL = "https://api.heroku.com";
export const INTEGRATION_GITLAB_API_URL = "https://gitlab.com/api";
export const INTEGRATION_VERCEL_API_URL = "https://api.vercel.com";
export const INTEGRATION_NETLIFY_API_URL = "https://api.netlify.com";
export const INTEGRATION_RENDER_API_URL = "https://api.render.com";
export const INTEGRATION_RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2";
export const INTEGRATION_FLYIO_API_URL = "https://api.fly.io/graphql";
export const INTEGRATION_CIRCLECI_API_URL = "https://circleci.com/api";
export const INTEGRATION_TRAVISCI_API_URL = "https://api.travis-ci.com";
export const INTEGRATION_SUPABASE_API_URL = "https://api.supabase.com";
export const INTEGRATION_LARAVELFORGE_API_URL = "https://forge.laravel.com";
export const INTEGRATION_CHECKLY_API_URL = "https://api.checklyhq.com";
export const INTEGRATION_CLOUDFLARE_PAGES_API_URL = "https://api.cloudflare.com";
export const INTEGRATION_BITBUCKET_API_URL = "https://api.bitbucket.org";
export const INTEGRATION_CODEFRESH_API_URL = "https://g.codefresh.io/api";
export const INTEGRATION_DIGITAL_OCEAN_API_URL = "https://api.digitalocean.com";
export const INTEGRATION_CLOUD_66_API_URL = "https://app.cloud66.com/api";

export const getIntegrationOptions = async () => {
    const INTEGRATION_OPTIONS = [
        {
            name: "Heroku",
            slug: "heroku",
            image: "Heroku.png",
            isAvailable: true,
            type: "oauth",
            clientId: await getClientIdHeroku(),
            docsLink: "",
        },
        {
            name: "Vercel",
            slug: "vercel",
            image: "Vercel.png",
            isAvailable: true,
            type: "oauth",
            clientId: "",
            clientSlug: await getClientSlugVercel(),
            docsLink: "",
        },
        {
            name: "Netlify",
            slug: "netlify",
            image: "Netlify.png",
            isAvailable: true,
            type: "oauth",
            clientId: await getClientIdNetlify(),
            docsLink: "",
        },
        {
            name: "GitHub",
            slug: "github",
            image: "GitHub.png",
            isAvailable: true,
            type: "oauth",
            clientId: await getClientIdGitHub(),
            docsLink: "",
        },
        {
            name: "Render",
            slug: "render",
            image: "Render.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "Railway",
            slug: "railway",
            image: "Railway.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "Fly.io",
            slug: "flyio",
            image: "Flyio.svg",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "AWS Parameter Store",
            slug: "aws-parameter-store",
            image: "Amazon Web Services.png",
            isAvailable: true,
            type: "custom",
            clientId: "",
            docsLink: "",
        },
        {
            name: "Laravel Forge",
            slug: "laravel-forge",
            image: "Laravel Forge.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "AWS Secret Manager",
            slug: "aws-secret-manager",
            image: "Amazon Web Services.png",
            isAvailable: true,
            type: "custom",
            clientId: "",
            docsLink: "",
        },
        {
            name: "Azure Key Vault",
            slug: "azure-key-vault",
            image: "Microsoft Azure.png",
            isAvailable: true,
            type: "oauth",
            clientId: await getClientIdAzure(),
            docsLink: "",
        },
        {
            name: "Circle CI",
            slug: "circleci",
            image: "Circle CI.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "GitLab",
            slug: "gitlab",
            image: "GitLab.png",
            isAvailable: true,
            type: "custom",
            clientId: await getClientIdGitLab(),
            docsLink: "",
        },
        {
            name: "Travis CI",
            slug: "travisci",
            image: "Travis CI.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "Supabase",
            slug: "supabase",
            image: "Supabase.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "Checkly",
            slug: "checkly",
            image: "Checkly.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "HashiCorp Vault",
            slug: "hashicorp-vault",
            image: "Vault.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "Google Cloud Platform",
            slug: "gcp",
            image: "Google Cloud Platform.png",
            isAvailable: false,
            type: "",
            clientId: "",
            docsLink: ""
        },
        {
            name: "Cloudflare Pages",
            slug: "cloudflare-pages",
            image: "Cloudflare.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: ""
        },
        {
          name: "BitBucket",
          slug: "bitbucket",
          image: "BitBucket.png",
          isAvailable: true,
          type: "oauth",
          clientId: await getClientIdBitBucket(),
          docsLink: ""
        },
        {
            name: "Codefresh",
            slug: "codefresh",
            image: "Codefresh.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "Digital Ocean App Platform",
            slug: "digital-ocean-app-platform",
            image: "Digital Ocean.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
        {
            name: "Cloud 66",
            slug: "cloud-66",
            image: "Cloud 66.png",
            isAvailable: true,
            type: "pat",
            clientId: "",
            docsLink: "",
        },
    ]
    
    return INTEGRATION_OPTIONS;
}
