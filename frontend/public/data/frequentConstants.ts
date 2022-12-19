interface Mapping {
  [key: string]: string;
}

const envMapping: Mapping = {
  Development: "dev",
  Staging: "staging",
  Production: "prod",
  Testing: "test",
};

const reverseEnvMapping: Mapping = {
  dev: "Development",
  staging: "Staging",
  prod: "Production",
  test: "Testing",
};

const contextNetlifyMapping: Mapping = {
  "dev": "Local development",
  "branch-deploy": "Branch deploys",
  "deploy-review": "Deploy Previews",
  "production": "Production"
}

const reverseContextNetlifyMapping: Mapping = {
  "Local development": "dev",
  "Branch deploys": "branch-deploy",
  "Deploy Previews": "deploy-preview",
  "Production": "production"
}

export {
  contextNetlifyMapping,
  envMapping,
  reverseContextNetlifyMapping,
  reverseEnvMapping}
