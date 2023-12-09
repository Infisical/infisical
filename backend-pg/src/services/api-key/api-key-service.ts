import crypto from "node:crypto";
import bcrypt from "bcrypt";

import { TApiKeys } from "@app/db/schemas/api-keys";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

import { TApiKeyDalFactory } from "./api-key-dal";

type TApiKeyServiceFactoryDep = {
  apiKeyDal: TApiKeyDalFactory;
};

export type TApiKeyServiceFactory = ReturnType<typeof apiKeyServiceFactory>;

const formatApiKey = ({ secretHash, ...data }: TApiKeys) => data;

export const apiKeyServiceFactory = ({ apiKeyDal }: TApiKeyServiceFactoryDep) => {
  const getMyApiKeys = async (userId: string) => {
    const apiKeys = await apiKeyDal.find({ userId });
    return apiKeys.map((key) => formatApiKey(key));
  };

  const createApiKey = async (userId: string, name: string, expiresIn: number) => {
    const appCfg = getConfig();
    const secret = crypto.randomBytes(16).toString("hex");
    const secretHash = await bcrypt.hash(secret, appCfg.SALT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    const apiKeyData = await apiKeyDal.create({
      userId,
      name,
      expiresAt,
      secretHash,
      lastUsed: new Date()
    });
    const apiKey = `ak.${apiKeyData.id}.${secret}`;

    return { apiKey, apiKeyData: formatApiKey(apiKeyData) };
  };

  const deleteApiKey = async (userId: string, apiKeyId: string) => {
    const [apiKeyData] = await apiKeyDal.delete({ id: apiKeyId, userId });
    if (!apiKeyData)
      throw new BadRequestError({ message: "Failed to find api key", name: "delete api key" });
    return formatApiKey(apiKeyData);
  };

  return {
    getMyApiKeys,
    createApiKey,
    deleteApiKey
  };
};
