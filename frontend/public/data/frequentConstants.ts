const envMapping = {
  Development: "dev",
  Staging: "staging",
  Production: "prod",
  Testing: "test",
};
  
const reverseEnvMapping = {
  dev: "Development",
  staging: "Staging",
  prod: "Production",
  test: "Testing",
};

const vercelMapping = {

}

const reverseContextNetlifyMapping = {
  "All": "all",
  "Local development": "dev",
  "Branch deploys": "branch-deploy",
  "Deploy Previews": "deploy-preview",
  "Production": "production"
}

export {
  envMapping,
  reverseEnvMapping,
  reverseContextNetlifyMapping
};
