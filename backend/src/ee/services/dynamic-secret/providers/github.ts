import axios from "axios";
import jwt from "jsonwebtoken";

import { crypto } from "@app/lib/crypto";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { DynamicSecretGithubSchema, TDynamicProviderFns } from "./models";

interface GitHubInstallationTokenResponse {
  token: string;
  expires_at: string; // ISO 8601 timestamp e.g., "2024-01-15T12:00:00Z"
  permissions?: Record<string, string>;
  repository_selection?: string;
}

interface TGithubProviderInputs {
  appId: number;
  installationId: number;
  privateKey: string;
}

export const GithubProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretGithubSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $generateGitHubInstallationAccessToken = async (
    credentials: TGithubProviderInputs
  ): Promise<GitHubInstallationTokenResponse> => {
    const { appId, installationId, privateKey } = credentials;

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iat: nowInSeconds - 5,
      exp: nowInSeconds + 60,
      iss: String(appId)
    };

    let appJwt: string;
    try {
      appJwt = crypto.jwt().sign(jwtPayload, privateKey, { algorithm: "RS256" });
    } catch (error) {
      let message = "Failed to sign JWT.";
      if (error instanceof jwt.JsonWebTokenError) {
        message += ` JsonWebTokenError: ${error.message}`;
      }
      throw new InternalServerError({
        message
      });
    }

    const tokenUrl = `${IntegrationUrls.GITHUB_API_URL}/app/installations/${String(installationId)}/access_tokens`;

    try {
      const response = await axios.post<GitHubInstallationTokenResponse>(tokenUrl, undefined, {
        headers: {
          Authorization: `Bearer ${appJwt}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });

      if (response.status === 201 && response.data.token) {
        return response.data; // Includes token, expires_at, permissions, repository_selection
      }

      throw new InternalServerError({
        message: `GitHub API responded with unexpected status ${response.status}: ${JSON.stringify(response.data)}`
      });
    } catch (error) {
      let message = "Failed to fetch GitHub installation access token.";
      if (axios.isAxiosError(error) && error.response) {
        const githubErrorMsg =
          (error.response.data as { message?: string })?.message || JSON.stringify(error.response.data);
        message += ` GitHub API Error: ${error.response.status} - ${githubErrorMsg}`;

        // Classify as BadRequestError for auth-related issues (401, 403, 404) which might be due to user input
        if ([401, 403, 404].includes(error.response.status)) {
          throw new BadRequestError({ message });
        }
      }

      throw new InternalServerError({ message });
    }
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    await $generateGitHubInstallationAccessToken(providerInputs);
    return true;
  };

  const create = async (data: { inputs: unknown }) => {
    const { inputs } = data;
    const providerInputs = await validateProviderInputs(inputs);

    const ghTokenData = await $generateGitHubInstallationAccessToken(providerInputs);
    const entityId = alphaNumericNanoId(32);

    return {
      entityId,
      data: {
        TOKEN: ghTokenData.token,
        EXPIRES_AT: ghTokenData.expires_at,
        PERMISSIONS: ghTokenData.permissions,
        REPOSITORY_SELECTION: ghTokenData.repository_selection
      }
    };
  };

  const revoke = async () => {
    // GitHub installation tokens cannot be revoked.
    throw new BadRequestError({
      message:
        "Github dynamic secret does not support revocation because GitHub itself cannot revoke installation tokens"
    });
  };

  const renew = async () => {
    // No renewal
    throw new BadRequestError({ message: "Github dynamic secret does not support renewal" });
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
