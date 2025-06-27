import crypto from "crypto";

import { NavigateFn } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import { localStorageService } from "@app/helpers/localStorage";
import { TCloudIntegration, UserWsKeyPair } from "@app/hooks/api/types";

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

export const createIntegrationMissingEnvVarsNotification = (
  slug: string,
  type: "cloud" | "cicd" = "cloud",
  hashtag?: string
) =>
  createNotification({
    type: "error",
    text: (
      <a
        href={`https://infisical.com/docs/integrations/${type}/${slug}${
          hashtag ? `#${hashtag}` : ""
        }`}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        Click here to view docs
      </a>
    ),
    title: "Missing Environment Variables"
  });

export const redirectForProviderAuth = (
  projectId: string,
  navigate: NavigateFn,
  integrationOption: TCloudIntegration
) => {
  try {
    // generate CSRF token for OAuth2 code-token exchange integrations
    const state = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", state);
    localStorageService.setIntegrationProjectId(projectId);

    switch (integrationOption.slug) {
      case "gcp-secret-manager":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/gcp-secret-manager/authorize",
          params: {
            projectId
          }
        });
        break;
      case "azure-key-vault": {
        if (!integrationOption.clientId) {
          createIntegrationMissingEnvVarsNotification(integrationOption.slug);
          return;
        }
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/azure-key-vault/authorize",
          params: {
            projectId
          },
          search: {
            clientId: integrationOption.clientId,
            state
          }
        });
        break;
      }
      case "azure-app-configuration": {
        if (!integrationOption.clientId) {
          createIntegrationMissingEnvVarsNotification(integrationOption.slug);
          return;
        }
        const link = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${integrationOption.clientId}&response_type=code&redirect_uri=${window.location.origin}/integrations/azure-app-configuration/oauth2/callback&response_mode=query&scope=https://azconfig.io/.default openid offline_access&state=${state}`;
        window.location.assign(link);
        break;
      }
      case "aws-parameter-store":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/aws-parameter-store/authorize",
          params: {
            projectId
          }
        });
        break;
      case "aws-secret-manager":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/aws-secret-manager/authorize",
          params: {
            projectId
          }
        });
        break;
      case "heroku": {
        if (!integrationOption.clientId) {
          createIntegrationMissingEnvVarsNotification(integrationOption.slug);
          return;
        }
        const link = `https://id.heroku.com/oauth/authorize?client_id=${integrationOption.clientId}&response_type=code&scope=write-protected&state=${state}`;
        window.location.assign(link);
        break;
      }
      case "vercel": {
        if (!integrationOption.clientSlug) {
          createIntegrationMissingEnvVarsNotification(integrationOption.slug);
          return;
        }
        const link = `https://vercel.com/integrations/${integrationOption.clientSlug}/new?state=${state}`;
        window.location.assign(link);
        break;
      }
      case "netlify": {
        if (!integrationOption.clientId) {
          createIntegrationMissingEnvVarsNotification(integrationOption.slug);
          return;
        }
        const link = `https://app.netlify.com/authorize?client_id=${integrationOption.clientId}&response_type=code&state=${state}&redirect_uri=${window.location.origin}/integrations/netlify/oauth2/callback`;

        window.location.assign(link);
        break;
      }
      case "github":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/github/auth-mode-selection",
          params: {
            projectId
          }
        });
        break;
      case "gitlab":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/gitlab/authorize",
          params: {
            projectId
          }
        });
        break;
      case "render":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/render/authorize",
          params: {
            projectId
          }
        });
        break;
      case "flyio":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/flyio/authorize",
          params: {
            projectId
          }
        });
        break;
      case "circleci":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/circleci/authorize",
          params: {
            projectId
          }
        });
        break;
      case "databricks":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/databricks/authorize",
          params: {
            projectId
          }
        });
        break;
      case "laravel-forge":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/laravel-forge/authorize",
          params: {
            projectId
          }
        });
        break;
      case "travisci":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/travisci/authorize",
          params: {
            projectId
          }
        });
        break;
      case "supabase":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/supabase/authorize",
          params: {
            projectId
          }
        });
        break;
      case "checkly":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/checkly/authorize",
          params: {
            projectId
          }
        });
        break;
      case "qovery":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/qovery/authorize",
          params: {
            projectId
          }
        });
        break;
      case "railway":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/railway/authorize",
          params: {
            projectId
          }
        });
        break;
      case "terraform-cloud":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/terraform-cloud/authorize",
          params: {
            projectId
          }
        });
        break;
      case "hashicorp-vault":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/hashicorp-vault/authorize",
          params: {
            projectId
          }
        });
        break;
      case "cloudflare-pages":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/cloudflare-pages/authorize",
          params: {
            projectId
          }
        });
        break;
      case "cloudflare-workers":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/cloudflare-workers/authorize",
          params: {
            projectId
          }
        });
        break;
      case "bitbucket": {
        if (!integrationOption.clientId) {
          createIntegrationMissingEnvVarsNotification(integrationOption.slug, "cicd");
          return;
        }
        const link = `https://bitbucket.org/site/oauth2/authorize?client_id=${integrationOption.clientId}&response_type=code&redirect_uri=${window.location.origin}/integrations/bitbucket/oauth2/callback&state=${state}`;
        window.location.assign(link);
        break;
      }
      case "codefresh":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/codefresh/authorize",
          params: {
            projectId
          }
        });
        break;
      case "digital-ocean-app-platform":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/digital-ocean-app-platform/authorize",
          params: {
            projectId
          }
        });
        break;
      case "cloud-66":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/cloud-66/authorize",
          params: {
            projectId
          }
        });
        break;
      case "northflank":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/northflank/authorize",
          params: {
            projectId
          }
        });
        break;
      case "windmill":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/windmill/authorize",
          params: {
            projectId
          }
        });
        break;
      case "teamcity":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/teamcity/authorize",
          params: {
            projectId
          }
        });
        break;
      case "hasura-cloud":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/hasura-cloud/authorize",
          params: {
            projectId
          }
        });
        break;
      case "rundeck":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/rundeck/authorize",
          params: {
            projectId
          }
        });
        break;
      case "azure-devops":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/azure-devops/authorize",
          params: {
            projectId
          }
        });
        break;
      case "octopus-deploy":
        navigate({
          to: "/projects/$projectId/secret-manager/integrations/octopus-deploy/authorize",
          params: {
            projectId
          }
        });
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(err);
  }
};
