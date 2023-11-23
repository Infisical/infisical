interface Mapping {
  [key: string]: string;
}

const integrationSlugNameMapping: Mapping = {
  "azure-key-vault": "Azure Key Vault",
  "aws-parameter-store": "AWS Parameter Store",
  "aws-secret-manager": "AWS Secrets Manager",
  heroku: "Heroku",
  vercel: "Vercel",
  netlify: "Netlify",
  github: "GitHub",
  gitlab: "GitLab",
  render: "Render",
  "laravel-forge": "Laravel Forge",
  railway: "Railway",
  flyio: "Fly.io",
  circleci: "CircleCI",
  travisci: "TravisCI",
  supabase: "Supabase",
  checkly: "Checkly",
  qovery: "Qovery",
  "terraform-cloud": "Terraform Cloud",
  teamcity: "TeamCity",
  "hashicorp-vault": "Vault",
  "cloudflare-pages": "Cloudflare Pages",
  "cloudflare-workers": "Cloudflare Workers",
  codefresh: "Codefresh",
  "digital-ocean-app-platform": "Digital Ocean App Platform",
  bitbucket: "BitBucket",
  "cloud-66": "Cloud 66",
  northflank: "Northflank",
  windmill: "Windmill",
  "gcp-secret-manager": "GCP Secret Manager",
  "hasura-cloud": "Hasura Cloud"
};

const envMapping: Mapping = {
  Development: "dev",
  Staging: "staging",
  Production: "prod",
  Testing: "test"
};

const reverseEnvMapping: Mapping = {
  dev: "Development",
  staging: "Staging",
  prod: "Production",
  test: "Testing"
};

const contextNetlifyMapping: Mapping = {
  dev: "Local development",
  "branch-deploy": "Branch deploys",
  "deploy-preview": "Deploy Previews",
  production: "Production"
};

const reverseContextNetlifyMapping: Mapping = {
  "Local development": "dev",
  "Branch deploys": "branch-deploy",
  "Deploy Previews": "deploy-preview",
  Production: "production"
};

const plansDev: Mapping = {
  starter: "prod_Mb4ATFT5QAHoPM",
  team: "prod_NEpD2WMXUS2eDn",
  professional: "prod_Mb4CetZ2jE7jdl",
  enterprise: "licence_key_required"
};

const plansProd: Mapping = {
  starter: "prod_Mb8oR5XNwyFTul",
  team: "prod_NEp7fAB3UJWK6A",
  professional: "prod_Mb8pUIpA0OUi5N",
  enterprise: "licence_key_required"
};

const plans = plansProd || plansDev;

export {
  contextNetlifyMapping,
  envMapping,
  integrationSlugNameMapping,
  plans,
  reverseContextNetlifyMapping,
  reverseEnvMapping
};
