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

const reverseContextNetlifyMapping: Mapping = {
  "All": "all",
  "Local development": "dev",
  "Branch deploys": "branch-deploy",
  "Deploy Previews": "deploy-preview",
  "Production": "production"
}

export {
  envMapping,
  reverseContextNetlifyMapping,
  reverseEnvMapping};
