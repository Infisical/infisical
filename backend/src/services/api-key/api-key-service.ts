import crypto from "node:crypto";

import bcrypt from "bcrypt";

import { TApiKeys } from "@app/db/schemas/api-keys";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError, UnauthorizedError } from "@app/lib/errors";

import { TUserDALFactory } from "../user/user-dal";
import { TApiKeyDALFactory } from "./api-key-dal";

type TApiKeyServiceFactoryDep = {
  apiKeyDAL: TApiKeyDALFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export type TApiKeyServiceFactory = ReturnType<typeof apiKeyServiceFactory>;

const formatApiKey = ({ secretHash, ...data }: TApiKeys) => data;

export const apiKeyServiceFactory = ({ apiKeyDAL, userDAL }: TApiKeyServiceFactoryDep) => {
  const getMyApiKeys = async (userId: string) => {
    const apiKeys = await apiKeyDAL.find({ userId });
    return apiKeys.map((key) => formatApiKey(key));
  };

  const createApiKey = async (userId: string, name: string, expiresIn: number) => {
    const appCfg = getConfig();
    const secret = crypto.randomBytes(16).toString("hex");
    const secretHash = await bcrypt.hash(secret, appCfg.SALT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    const apiKeyData = await apiKeyDAL.create({
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
    const [apiKeyData] = await apiKeyDAL.delete({ id: apiKeyId, userId });
    if (!apiKeyData) throw new NotFoundError({ message: "API key not found" });
    return formatApiKey(apiKeyData);
  };

  const fnValidateApiKey = async (token: string) => {
    const [, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>token.split(".", 3);
    const apiKey = await apiKeyDAL.findById(TOKEN_IDENTIFIER);
    if (!apiKey) throw new UnauthorizedError();

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      await apiKeyDAL.deleteById(apiKey.id);
      throw new UnauthorizedError();
    }

    const isMatch = await bcrypt.compare(TOKEN_SECRET, apiKey.secretHash);
    if (!isMatch) throw new UnauthorizedError();
    await apiKeyDAL.updateById(apiKey.id, { lastUsed: new Date() });
    const user = await userDAL.findById(apiKey.userId);
    return user;
  };

  return {
    getMyApiKeys,
    createApiKey,
    deleteApiKey,
    fnValidateApiKey
  };
};
