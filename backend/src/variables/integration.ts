import {
  getClientIdAzure,
  getClientIdBitBucket,
  getClientIdGCPSecretManager,
  getClientIdGitHub,
  getClientIdGitLab,
  getClientIdHeroku,
  getClientIdNetlify,
  getClientSlugVercel
} from "../config";

// integrations
export const INTEGRATION_AZURE_KEY_VAULT = "azure-key-vault";
export const INTEGRATION_AWS_PARAMETER_STORE = "aws-parameter-store";
export const INTEGRATION_AWS_SECRET_MANAGER = "aws-secret-manager";
export const INTEGRATION_GCP_SECRET_MANAGER = "gcp-secret-manager";
export const INTEGRATION_HEROKU = "heroku";
export const INTEGRATION_VERCEL = "vercel";
export const INTEGRATION_NETLIFY = "netlify";
export const INTEGRATION_GITHUB = "github";
export const INTEGRATION_GITLAB = "gitlab";
export const INTEGRATION_RENDER = "render";
export const INTEGRATION_RAILWAY = "railway";
export const INTEGRATION_FLYIO = "flyio";
export const INTEGRATION_LARAVELFORGE = "laravel-forge";
export const INTEGRATION_CIRCLECI = "circleci";
export const INTEGRATION_TRAVISCI = "travisci";
export const INTEGRATION_TEAMCITY = "teamcity";
export const INTEGRATION_SUPABASE = "supabase";
export const INTEGRATION_CHECKLY = "checkly";
export const INTEGRATION_QOVERY = "qovery";
export const INTEGRATION_TERRAFORM_CLOUD = "terraform-cloud";
export const INTEGRATION_HASHICORP_VAULT = "hashicorp-vault";
export const INTEGRATION_CLOUDFLARE_PAGES = "cloudflare-pages";
export const INTEGRATION_CLOUDFLARE_WORKERS = "cloudflare-workers";
export const INTEGRATION_BITBUCKET = "bitbucket";
export const INTEGRATION_CODEFRESH = "codefresh";
export const INTEGRATION_WINDMILL = "windmill";
export const INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM = "digital-ocean-app-platform";
export const INTEGRATION_CLOUD_66 = "cloud-66";
export const INTEGRATION_NORTHFLANK = "northflank";
export const INTEGRATION_HASURA_CLOUD = "hasura-cloud";
export const INTEGRATION_SET = new Set([
  INTEGRATION_GCP_SECRET_MANAGER,
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
  INTEGRATION_TEAMCITY,
  INTEGRATION_SUPABASE,
  INTEGRATION_CHECKLY,
  INTEGRATION_QOVERY,
  INTEGRATION_TERRAFORM_CLOUD,
  INTEGRATION_HASHICORP_VAULT,
  INTEGRATION_CLOUDFLARE_PAGES,
  INTEGRATION_CLOUDFLARE_WORKERS,
  INTEGRATION_CODEFRESH,
  INTEGRATION_WINDMILL,
  INTEGRATION_BITBUCKET,
  INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM,
  INTEGRATION_CLOUD_66,
  INTEGRATION_NORTHFLANK,
  INTEGRATION_HASURA_CLOUD
]);

// integration types
export const INTEGRATION_OAUTH2 = "oauth2";

// integration oauth endpoints
export const INTEGRATION_GCP_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const INTEGRATION_AZURE_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const INTEGRATION_HEROKU_TOKEN_URL = "https://id.heroku.com/oauth/token";
export const INTEGRATION_VERCEL_TOKEN_URL = "https://api.vercel.com/v2/oauth/access_token";
export const INTEGRATION_NETLIFY_TOKEN_URL = "https://api.netlify.com/oauth/token";
export const INTEGRATION_GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const INTEGRATION_GITLAB_TOKEN_URL = "https://gitlab.com/oauth/token";
export const INTEGRATION_BITBUCKET_TOKEN_URL = "https://bitbucket.org/site/oauth2/access_token";

// integration apps endpoints
export const INTEGRATION_GCP_API_URL = "https://cloudresourcemanager.googleapis.com";
export const INTEGRATION_HEROKU_API_URL = "https://api.heroku.com";
export const GITLAB_URL = "https://gitlab.com";
export const INTEGRATION_GITLAB_API_URL = `${GITLAB_URL}/api`;
export const INTEGRATION_GITHUB_API_URL = "https://api.github.com";
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
export const INTEGRATION_QOVERY_API_URL = "https://api.qovery.com";
export const INTEGRATION_TERRAFORM_CLOUD_API_URL = "https://app.terraform.io";
export const INTEGRATION_CLOUDFLARE_PAGES_API_URL = "https://api.cloudflare.com";
export const INTEGRATION_CLOUDFLARE_WORKERS_API_URL = "https://api.cloudflare.com";
export const INTEGRATION_BITBUCKET_API_URL = "https://api.bitbucket.org";
export const INTEGRATION_CODEFRESH_API_URL = "https://g.codefresh.io/api";
export const INTEGRATION_WINDMILL_API_URL = "https://app.windmill.dev/api";
export const INTEGRATION_DIGITAL_OCEAN_API_URL = "https://api.digitalocean.com";
export const INTEGRATION_CLOUD_66_API_URL = "https://app.cloud66.com/api";
export const INTEGRATION_NORTHFLANK_API_URL = "https://api.northflank.com";
export const INTEGRATION_HASURA_CLOUD_API_URL = "https://data.pro.hasura.io/v1/graphql";

export const INTEGRATION_GCP_SECRET_MANAGER_SERVICE_NAME = "secretmanager.googleapis.com";
export const INTEGRATION_GCP_SECRET_MANAGER_URL = `https://${INTEGRATION_GCP_SECRET_MANAGER_SERVICE_NAME}`;
export const INTEGRATION_GCP_SERVICE_USAGE_URL = "https://serviceusage.googleapis.com";
export const INTEGRATION_GCP_CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

export const getIntegrationOptions = async () => {
  const INTEGRATION_OPTIONS = [
    {
      name: "Heroku",
      slug: "heroku",
      image: "Heroku.png",
      isAvailable: true,
      type: "oauth",
      clientId: await getClientIdHeroku(),
      docsLink: ""
    },
    {
      name: "Vercel",
      slug: "vercel",
      image: "Vercel.png",
      isAvailable: true,
      type: "oauth",
      clientId: "",
      clientSlug: await getClientSlugVercel(),
      docsLink: ""
    },
    {
      name: "Netlify",
      slug: "netlify",
      image: "Netlify.png",
      isAvailable: true,
      type: "oauth",
      clientId: await getClientIdNetlify(),
      docsLink: ""
    },
    {
      name: "GitHub",
      slug: "github",
      image: "GitHub.png",
      isAvailable: true,
      type: "oauth",
      clientId: await getClientIdGitHub(),
      docsLink: ""
    },
    {
      name: "Render",
      slug: "render",
      image: "Render.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Railway",
      slug: "railway",
      image: "Railway.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Fly.io",
      slug: "flyio",
      image: "Flyio.svg",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "AWS Parameter Store",
      slug: "aws-parameter-store",
      image: "Amazon Web Services.png",
      isAvailable: true,
      type: "custom",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Laravel Forge",
      slug: "laravel-forge",
      image: "Laravel Forge.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "AWS Secrets Manager",
      slug: "aws-secret-manager",
      image: "Amazon Web Services.png",
      isAvailable: true,
      type: "custom",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Azure Key Vault",
      slug: "azure-key-vault",
      image: "Microsoft Azure.png",
      isAvailable: true,
      type: "oauth",
      clientId: await getClientIdAzure(),
      docsLink: ""
    },
    {
      name: "Circle CI",
      slug: "circleci",
      image: "Circle CI.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "GitLab",
      slug: "gitlab",
      image: "GitLab.png",
      isAvailable: true,
      type: "custom",
      clientId: await getClientIdGitLab(),
      docsLink: ""
    },
    {
      name: "Terraform Cloud",
      slug: "terraform-cloud",
      image: "Terraform Cloud.png",
      isAvailable: true,
      type: "pat",
      cliendId: "",
      docsLink: ""
    },
    {
      name: "Travis CI",
      slug: "travisci",
      image: "Travis CI.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "TeamCity",
      slug: "teamcity",
      image: "TeamCity.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Supabase",
      slug: "supabase",
      image: "Supabase.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Checkly",
      slug: "checkly",
      image: "Checkly.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Qovery",
      slug: "qovery",
      image: "Qovery.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "HashiCorp Vault",
      slug: "hashicorp-vault",
      image: "Vault.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "GCP Secret Manager",
      slug: "gcp-secret-manager",
      image: "Google Cloud Platform.png",
      isAvailable: true,
      type: "oauth",
      clientId: await getClientIdGCPSecretManager(),
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
      name: "Cloudflare Workers",
      slug: "cloudflare-workers",
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
      docsLink: ""
    },
    {
      name: "Windmill",
      slug: "windmill",
      image: "Windmill.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Digital Ocean App Platform",
      slug: "digital-ocean-app-platform",
      image: "Digital Ocean.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Cloud 66",
      slug: "cloud-66",
      image: "Cloud 66.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Northflank",
      slug: "northflank",
      image: "Northflank.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Hasura Cloud",
      slug: "hasura-cloud",
      image: "Hasura.svg",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    }
  ];

  return INTEGRATION_OPTIONS;
};
