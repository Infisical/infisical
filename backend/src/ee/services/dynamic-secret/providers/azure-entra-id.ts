import axios from "axios";
import { customAlphabet } from "nanoid";

import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";

import { AzureEntraIDSchema, TDynamicProviderFns } from "./models";

const MSFT_GRAPH_API_URL = "https://graph.microsoft.com/v1.0/";
const MSFT_LOGIN_URL = "https://login.microsoftonline.com";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 64)();
};

type User = { name: string; id: string; email: string };

export const AzureEntraIDProvider = (): TDynamicProviderFns & {
  fetchAzureEntraIdUsers: (tenantId: string, applicationId: string, clientSecret: string) => Promise<User[]>;
} => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await AzureEntraIDSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $getToken = async (
    tenantId: string,
    applicationId: string,
    clientSecret: string
  ): Promise<{ token?: string; success: boolean }> => {
    const response = await axios.post<{ access_token: string }>(
      `${MSFT_LOGIN_URL}/${tenantId}/oauth2/v2.0/token`,
      {
        grant_type: "client_credentials",
        client_id: applicationId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default"
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    if (response.status === 200) {
      return { token: response.data.access_token, success: true };
    }
    return { success: false };
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    try {
      const data = await $getToken(providerInputs.tenantId, providerInputs.applicationId, providerInputs.clientSecret);
      return data.success;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.clientSecret, providerInputs.applicationId, providerInputs.tenantId]
      });
      throw new BadRequestError({
        message: `Failed to connect with provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const create = async ({ inputs }: { inputs: unknown }) => {
    const providerInputs = await validateProviderInputs(inputs);

    const password = generatePassword();
    try {
      const data = await $getToken(providerInputs.tenantId, providerInputs.applicationId, providerInputs.clientSecret);
      if (!data.success) {
        throw new BadRequestError({ message: "Failed to authorize to Microsoft Entra ID" });
      }

      const response = await axios.patch(
        `${MSFT_GRAPH_API_URL}/users/${providerInputs.userId}`,
        {
          passwordProfile: {
            forceChangePasswordNextSignIn: false,
            password
          }
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.token}`
          }
        }
      );
      if (response.status !== 204) {
        throw new BadRequestError({ message: "Failed to update password" });
      }

      return { entityId: providerInputs.userId, data: { email: providerInputs.email, password } };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [
          providerInputs.clientSecret,
          providerInputs.applicationId,
          providerInputs.userId,
          providerInputs.email,
          password
        ]
      });
      throw new BadRequestError({
        message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    try {
      // Creates a new password
      await create({ inputs });
      return { entityId };
    } catch (err) {
      const providerInputs = await validateProviderInputs(inputs);
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.clientSecret, providerInputs.applicationId, entityId]
      });
      throw new BadRequestError({
        message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const fetchAzureEntraIdUsers = async (tenantId: string, applicationId: string, clientSecret: string) => {
    const data = await $getToken(tenantId, applicationId, clientSecret);
    if (!data.success) {
      throw new BadRequestError({ message: "Failed to authorize to Microsoft Entra ID" });
    }

    const response = await axios.get<{ value: [{ id: string; displayName: string; userPrincipalName: string }] }>(
      `${MSFT_GRAPH_API_URL}/users`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${data.token}`
        }
      }
    );

    if (response.status !== 200) {
      throw new BadRequestError({ message: "Failed to fetch users" });
    }

    const users = response.data.value.map((user) => {
      return {
        name: user.displayName,
        id: user.id,
        email: user.userPrincipalName
      };
    });
    return users;
  };

  const renew = async (_inputs: unknown, entityId: string) => {
    // No renewal necessary
    return { entityId };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew,
    fetchAzureEntraIdUsers
  };
};
