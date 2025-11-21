import { getConfig } from "@app/lib/config/env";

export enum Integrations {
  AZURE_KEY_VAULT = "azure-key-vault",
  AWS_PARAMETER_STORE = "aws-parameter-store",
  AWS_SECRET_MANAGER = "aws-secret-manager",
  GCP_SECRET_MANAGER = "gcp-secret-manager",
  HEROKU = "heroku",
  VERCEL = "vercel",
  NETLIFY = "netlify",
  GITHUB = "github",
  GITLAB = "gitlab",
  RENDER = "render",
  RAILWAY = "railway",
  FLYIO = "flyio",
  LARAVELFORGE = "laravel-forge",
  CIRCLECI = "circleci",
  DATABRICKS = "databricks",
  TRAVISCI = "travisci",
  TEAMCITY = "teamcity",
  SUPABASE = "supabase",
  CHECKLY = "checkly",
  QOVERY = "qovery",
  TERRAFORM_CLOUD = "terraform-cloud",
  HASHICORP_VAULT = "hashicorp-vault",
  CLOUDFLARE_PAGES = "cloudflare-pages",
  CLOUDFLARE_WORKERS = "cloudflare-workers",
  BITBUCKET = "bitbucket",
  CODEFRESH = "codefresh",
  WINDMILL = "windmill",
  DIGITAL_OCEAN_APP_PLATFORM = "digital-ocean-app-platform",
  CLOUD_66 = "cloud-66",
  NORTHFLANK = "northflank",
  HASURA_CLOUD = "hasura-cloud",
  RUNDECK = "rundeck",
  AZURE_DEVOPS = "azure-devops",
  AZURE_APP_CONFIGURATION = "azure-app-configuration",
  OCTOPUS_DEPLOY = "octopus-deploy"
}

export enum IntegrationType {
  OAUTH2 = "oauth2"
}

export enum IntegrationInitialSyncBehavior {
  OVERWRITE_TARGET = "overwrite-target",
  PREFER_TARGET = "prefer-target",
  PREFER_SOURCE = "prefer-source"
}

export enum IntegrationMappingBehavior {
  ONE_TO_ONE = "one-to-one",
  MANY_TO_ONE = "many-to-one"
}

export enum IntegrationUrls {
  // integration oauth endpoints
  GCP_TOKEN_URL = "https://oauth2.googleapis.com/token",
  AZURE_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  HEROKU_TOKEN_URL = "https://id.heroku.com/oauth/token",
  VERCEL_TOKEN_URL = "https://api.vercel.com/v2/oauth/access_token",
  NETLIFY_TOKEN_URL = "https://api.netlify.com/oauth/token",
  GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token",
  GITLAB_TOKEN_URL = "https://gitlab.com/oauth/token",
  BITBUCKET_TOKEN_URL = "https://bitbucket.org/site/oauth2/access_token",
  CAMUNDA_TOKEN_URL = "https://login.cloud.camunda.io/oauth/token",

  // integration apps endpoints
  GCP_API_URL = "https://cloudresourcemanager.googleapis.com",
  HEROKU_API_URL = "https://api.heroku.com",
  GITLAB_URL = "https://gitlab.com",
  GITLAB_API_URL = `${GITLAB_URL}/api`,
  GITHUB_API_URL = "https://api.github.com",
  VERCEL_API_URL = "https://api.vercel.com",
  NETLIFY_API_URL = "https://api.netlify.com",
  RENDER_API_URL = "https://api.render.com",
  RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2",
  FLYIO_API_URL = "https://api.fly.io/graphql",
  CIRCLECI_API_URL = "https://circleci.com/api",
  TRAVISCI_API_URL = "https://api.travis-ci.com",
  SUPABASE_API_URL = "https://api.supabase.com",
  LARAVELFORGE_API_URL = "https://forge.laravel.com",
  CHECKLY_API_URL = "https://api.checklyhq.com",
  QOVERY_API_URL = "https://api.qovery.com",
  TERRAFORM_CLOUD_API_URL = "https://app.terraform.io",
  CLOUDFLARE_PAGES_API_URL = "https://api.cloudflare.com",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  CLOUDFLARE_API_URL = "https://api.cloudflare.com",
  // eslint-disable-next-line
  CLOUDFLARE_WORKERS_API_URL = "https://api.cloudflare.com",
  BITBUCKET_API_URL = "https://api.bitbucket.org",
  CODEFRESH_API_URL = "https://g.codefresh.io/api",
  WINDMILL_API_URL = "https://app.windmill.dev/api",
  DIGITAL_OCEAN_API_URL = "https://api.digitalocean.com",
  CLOUD_66_API_URL = "https://app.cloud66.com/api",
  NORTHFLANK_API_URL = "https://api.northflank.com",
  HASURA_CLOUD_API_URL = "https://data.pro.hasura.io/v1/graphql",
  AZURE_DEVOPS_API_URL = "https://dev.azure.com",
  HUMANITEC_API_URL = "https://api.humanitec.io",
  CAMUNDA_API_URL = "https://api.cloud.camunda.io",

  GCP_SECRET_MANAGER_SERVICE_NAME = "secretmanager.googleapis.com",
  GCP_SECRET_MANAGER_URL = `https://${GCP_SECRET_MANAGER_SERVICE_NAME}`,
  GCP_SERVICE_USAGE_URL = "https://serviceusage.googleapis.com",
  GCP_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform",

  GITHUB_USER_INSTALLATIONS = "https://api.github.com/user/installations",
  CHEF_API_URL = "https://api.chef.io",
  DNS_MADE_EASY_API_URL = "https://api.dnsmadeeasy.com",
  DNS_MADE_EASY_SANDBOX_API_URL = "https://api.sandbox.dnsmadeeasy.com"
}

export const getIntegrationOptions = async () => {
  const appCfg = getConfig();

  const INTEGRATION_OPTIONS = [
    {
      name: "Heroku",
      slug: "heroku",
      image: "Heroku.png",
      isAvailable: true,
      type: "oauth",
      clientId: appCfg.CLIENT_ID_HEROKU,
      docsLink: ""
    },
    {
      name: "Vercel",
      slug: "vercel",
      image: "Vercel.png",
      isAvailable: true,
      type: "oauth",
      clientId: "",
      clientSlug: appCfg.CLIENT_SLUG_VERCEL,
      docsLink: ""
    },
    {
      name: "Netlify",
      slug: "netlify",
      image: "Netlify.png",
      isAvailable: true,
      type: "oauth",
      clientId: appCfg.CLIENT_ID_NETLIFY,
      docsLink: ""
    },
    {
      name: "GitHub",
      slug: "github",
      image: "GitHub.png",
      isAvailable: true,
      type: "oauth",
      clientId: appCfg.CLIENT_ID_GITHUB,
      clientSlug: appCfg.CLIENT_SLUG_GITHUB_APP,
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
      syncSlug: "aws-secrets-manager",
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
      clientId: appCfg.CLIENT_ID_AZURE,
      docsLink: ""
    },
    {
      name: "Azure App Configuration",
      slug: "azure-app-configuration",
      image: "Microsoft Azure.png",
      isAvailable: true,
      type: "oauth",
      clientId: appCfg.CLIENT_ID_AZURE,
      docsLink: ""
    },
    {
      name: "CircleCI",
      slug: "circleci",
      image: "CircleCI.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Databricks",
      slug: "databricks",
      image: "Databricks.png",
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
      clientId: appCfg.CLIENT_ID_GITLAB,
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
      clientId: appCfg.CLIENT_ID_GCP_SECRET_MANAGER,
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
      name: "Bitbucket",
      slug: "bitbucket",
      image: "Bitbucket.png",
      isAvailable: true,
      type: "oauth",
      clientId: appCfg.CLIENT_ID_BITBUCKET,
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
    },
    {
      name: "Rundeck",
      slug: "rundeck",
      image: "Rundeck.svg",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Azure DevOps",
      slug: "azure-devops",
      image: "Microsoft Azure.png",
      isAvailable: true,
      type: "pat",
      clientId: "",
      docsLink: ""
    },
    {
      name: "Octopus Deploy",
      slug: "octopus-deploy",
      image: "Octopus Deploy.png",
      isAvailable: true,
      type: "sat",
      clientId: "",
      docsLink: ""
    }
  ];

  return INTEGRATION_OPTIONS;
};

export enum IntegrationMetadataSyncMode {
  CUSTOM = "custom",
  SECRET_METADATA = "secret-metadata"
}
