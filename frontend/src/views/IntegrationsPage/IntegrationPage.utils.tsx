import crypto from "crypto";

import { TCloudIntegration, UserWsKeyPair } from "@app/hooks/api/types";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "../../components/utilities/cryptography/crypto";

export const generateBotKey = (botPublicKey: string, latestKey: UserWsKeyPair) => {
  const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

  if (!PRIVATE_KEY) {
    throw new Error("Private Key missing");
  }

  const WORKSPACE_KEY = decryptAssymmetric({
    ciphertext: latestKey.encryptedKey,
    nonce: latestKey.nonce,
    publicKey: latestKey.sender.publicKey,
    privateKey: PRIVATE_KEY
  });

  const { ciphertext, nonce } = encryptAssymmetric({
    plaintext: WORKSPACE_KEY,
    publicKey: botPublicKey,
    privateKey: PRIVATE_KEY
  });

  return { encryptedKey: ciphertext, nonce };
};

export const redirectForProviderAuth = (integrationOption: TCloudIntegration) => {
  try {
    // generate CSRF token for OAuth2 code-token exchange integrations
    const state = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", state);

    let link = "";
    switch (integrationOption.slug) {
      case "gcp-secret-manager":
        link = `${window.location.origin}/integrations/gcp-secret-manager/authorize`;
        break;
      case "azure-key-vault":
        link = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${integrationOption.clientId}&response_type=code&redirect_uri=${window.location.origin}/integrations/azure-key-vault/oauth2/callback&response_mode=query&scope=https://vault.azure.net/.default openid offline_access&state=${state}`;
        break;
      case "aws-parameter-store":
        link = `${window.location.origin}/integrations/aws-parameter-store/authorize`;
        break;
      case "aws-secret-manager":
        link = `${window.location.origin}/integrations/aws-secret-manager/authorize`;
        break;
      case "heroku":
        link = `https://id.heroku.com/oauth/authorize?client_id=${integrationOption.clientId}&response_type=code&scope=write-protected&state=${state}`;
        break;
      case "vercel":
        link = `https://vercel.com/integrations/${integrationOption.clientSlug}/new?state=${state}`;
        break;
      case "netlify":
        link = `https://app.netlify.com/authorize?client_id=${integrationOption.clientId}&response_type=code&state=${state}&redirect_uri=${window.location.origin}/integrations/netlify/oauth2/callback`;
        break;
      case "github":
        link = `https://github.com/login/oauth/authorize?client_id=${integrationOption.clientId}&response_type=code&scope=repo&redirect_uri=${window.location.origin}/integrations/github/oauth2/callback&state=${state}`;
        break;
      case "gitlab":
        link = `${window.location.origin}/integrations/gitlab/authorize`;
        break;
      case "render":
        link = `${window.location.origin}/integrations/render/authorize`;
        break;
      case "flyio":
        link = `${window.location.origin}/integrations/flyio/authorize`;
        break;
      case "circleci":
        link = `${window.location.origin}/integrations/circleci/authorize`;
        break;
      case "laravel-forge":
        link = `${window.location.origin}/integrations/laravel-forge/authorize`;
        break;
      case "travisci":
        link = `${window.location.origin}/integrations/travisci/authorize`;
        break;
      case "supabase":
        link = `${window.location.origin}/integrations/supabase/authorize`;
        break;
      case "checkly":
        link = `${window.location.origin}/integrations/checkly/authorize`;
        break;
      case "qovery":
        link = `${window.location.origin}/integrations/qovery/authorize`;
        break;
      case "railway":
        link = `${window.location.origin}/integrations/railway/authorize`;
        break;
      case "terraform-cloud":
        link = `${window.location.origin}/integrations/terraform-cloud/authorize`;
        break;
      case "hashicorp-vault":
        link = `${window.location.origin}/integrations/hashicorp-vault/authorize`;
        break;
      case "cloudflare-pages":
        link = `${window.location.origin}/integrations/cloudflare-pages/authorize`;
        break;
      case "cloudflare-workers":
        link = `${window.location.origin}/integrations/cloudflare-workers/authorize`;
        break;
      case "bitbucket":
        link = `https://bitbucket.org/site/oauth2/authorize?client_id=${integrationOption.clientId}&response_type=code&redirect_uri=${window.location.origin}/integrations/bitbucket/oauth2/callback&state=${state}`;
        break;
      case "codefresh":
        link = `${window.location.origin}/integrations/codefresh/authorize`;
        break;
      case "digital-ocean-app-platform":
        link = `${window.location.origin}/integrations/digital-ocean-app-platform/authorize`;
        break;
      case "cloud-66":
        link = `${window.location.origin}/integrations/cloud-66/authorize`;
        break;
      case "northflank":
        link = `${window.location.origin}/integrations/northflank/authorize`;
        break;
      case "windmill":
        link = `${window.location.origin}/integrations/windmill/authorize`;
        break;
      case "teamcity":
        link = `${window.location.origin}/integrations/teamcity/authorize`;
        break;
      case "hasura-cloud":
        link = `${window.location.origin}/integrations/hasura-cloud/authorize`;
        break;
      default:
        break;
    }

    if (link !== "") {
      window.location.assign(link);
    }
  } catch (err) {
    console.error(err);
  }
};

export const redirectToIntegrationAppConfigScreen = (provider: string, integrationAuthId: string) =>
  `/integrations/${provider}/create?integrationAuthId=${integrationAuthId}`;
