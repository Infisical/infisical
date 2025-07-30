import crypto from "crypto";

import { NavigateFn } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { localStorageService } from "@app/helpers/localStorage";
import { TCloudIntegration } from "@app/hooks/api/types";

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
          to: "/projects/secret-management/$projectId/integrations/gcp-secret-manager/authorize",
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
          to: "/projects/secret-management/$projectId/integrations/azure-key-vault/authorize",
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
          to: "/projects/secret-management/$projectId/integrations/aws-parameter-store/authorize",
          params: {
            projectId
          }
        });
        break;
      case "aws-secret-manager":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/aws-secret-manager/authorize",
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
          to: "/projects/secret-management/$projectId/integrations/github/auth-mode-selection",
          params: {
            projectId
          }
        });
        break;
      case "gitlab":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/gitlab/authorize",
          params: {
            projectId
          }
        });
        break;
      case "render":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/render/authorize",
          params: {
            projectId
          }
        });
        break;
      case "flyio":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/flyio/authorize",
          params: {
            projectId
          }
        });
        break;
      case "circleci":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/circleci/authorize",
          params: {
            projectId
          }
        });
        break;
      case "databricks":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/databricks/authorize",
          params: {
            projectId
          }
        });
        break;
      case "laravel-forge":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/laravel-forge/authorize",
          params: {
            projectId
          }
        });
        break;
      case "travisci":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/travisci/authorize",
          params: {
            projectId
          }
        });
        break;
      case "supabase":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/supabase/authorize",
          params: {
            projectId
          }
        });
        break;
      case "checkly":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/checkly/authorize",
          params: {
            projectId
          }
        });
        break;
      case "qovery":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/qovery/authorize",
          params: {
            projectId
          }
        });
        break;
      case "railway":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/railway/authorize",
          params: {
            projectId
          }
        });
        break;
      case "terraform-cloud":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/terraform-cloud/authorize",
          params: {
            projectId
          }
        });
        break;
      case "hashicorp-vault":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/hashicorp-vault/authorize",
          params: {
            projectId
          }
        });
        break;
      case "cloudflare-pages":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/cloudflare-pages/authorize",
          params: {
            projectId
          }
        });
        break;
      case "cloudflare-workers":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/cloudflare-workers/authorize",
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
          to: "/projects/secret-management/$projectId/integrations/codefresh/authorize",
          params: {
            projectId
          }
        });
        break;
      case "digital-ocean-app-platform":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/digital-ocean-app-platform/authorize",
          params: {
            projectId
          }
        });
        break;
      case "cloud-66":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/cloud-66/authorize",
          params: {
            projectId
          }
        });
        break;
      case "northflank":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/northflank/authorize",
          params: {
            projectId
          }
        });
        break;
      case "windmill":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/windmill/authorize",
          params: {
            projectId
          }
        });
        break;
      case "teamcity":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/teamcity/authorize",
          params: {
            projectId
          }
        });
        break;
      case "hasura-cloud":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/hasura-cloud/authorize",
          params: {
            projectId
          }
        });
        break;
      case "rundeck":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/rundeck/authorize",
          params: {
            projectId
          }
        });
        break;
      case "azure-devops":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/azure-devops/authorize",
          params: {
            projectId
          }
        });
        break;
      case "octopus-deploy":
        navigate({
          to: "/projects/secret-management/$projectId/integrations/octopus-deploy/authorize",
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
