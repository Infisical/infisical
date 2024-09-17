import axios from "axios";
import { customAlphabet } from "nanoid";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { AzureEntraIDSchema, DynamicSecretDataFetchTypes, TDynamicProviderFns } from "./models";

const MSFT_GRAPH_API_URL = "https://graph.microsoft.com/v1.0/";
const MSFT_LOGIN_URL = "https://login.microsoftonline.com";

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*$#";
  return customAlphabet(charset, 64)();
};

export const AzureEntraIDProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await AzureEntraIDSchema.parseAsync(inputs);
    return providerInputs;
  };

  const getToken = async (tenantId: string): Promise<{ token?: string; success: boolean }> => {
    const appCfg = getConfig();
    const response = await axios.post<{ access_token: string }>(
      `${MSFT_LOGIN_URL}/${tenantId}/oauth2/v2.0/token`,
      {
        grant_type: "client_credentials",
        client_id: appCfg.MSFT_ENTRA_ID_APPLICATION_ID,
        client_secret: appCfg.MSFT_ENTRA_ID_CLIENT_SECRET,
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
    const data = await getToken(providerInputs.tenantId);
    return data.success;
  };

  const renew = async (inputs: unknown, entityId: string) => {
    // Do nothing
    return { entityId };
  };

  const create = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const data = await getToken(providerInputs.tenantId);
    if (!data.success) {
      throw new BadRequestError({ message: "Failed to authorize to Microsoft Entra ID" });
    }

    const password = generatePassword();
    try {
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
    } catch (error) {
      logger.info(JSON.stringify(error));
    }

    return { entityId: providerInputs.userId, data: { userId: providerInputs.userId, password } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    await create(inputs);
    return { entityId };
  };

  const fetchData = async (inputs: unknown, toFetch: DynamicSecretDataFetchTypes) => {
    const providerInputs = await validateProviderInputs(inputs);

    const data = await getToken(providerInputs.tenantId);
    if (!data.success) {
      throw new BadRequestError({ message: "Failed to authorize to Microsoft Entra ID" });
    }

    switch (toFetch) {
      case DynamicSecretDataFetchTypes.Users: {
        const response = await axios.get<{ value: [{ displayName: string; id: string }] }>(
          `${MSFT_GRAPH_API_URL}/users`,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Bearer ${data.token}`
            }
          }
        );
        const users = response.data.value.map((user: { displayName: string; id: string }) => {
          return {
            name: user.displayName,
            id: user.id
          };
        });
        return {
          data: {
            users
          }
        };
      }
      default:
        throw new BadRequestError({ message: "Unknown data to fetch" });
    }
  };
  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew,
    fetchData
  };
};
