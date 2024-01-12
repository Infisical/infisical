import crypto from "node:crypto";

import bcrypt from "bcrypt";

import { TApiKeys } from "@app/db/schemas/api-keys";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

import { TUserDalFactory } from "../user/user-dal";
import { TApiKeyDalFactory } from "./api-key-dal";

type TApiKeyServiceFactoryDep = {
  apiKeyDal: TApiKeyDalFactory;
  userDal: Pick<TUserDalFactory, "findById">;
};

export type TApiKeyServiceFactory = ReturnType<typeof apiKeyServiceFactory>;

const formatApiKey = ({ secretHash, ...data }: TApiKeys) => data;

export const apiKeyServiceFactory = ({ apiKeyDal, userDal }: TApiKeyServiceFactoryDep) => {
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

  const fnValidateApiKey = async (token: string) => {
    const [, TOKEN_IDENTIFIER, TOKEN_SECRET] = <[string, string, string]>token.split(".", 3);
    const apiKey = await apiKeyDal.findById(TOKEN_IDENTIFIER);
    if (!apiKey) throw new UnauthorizedError();

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      await apiKeyDal.deleteById(apiKey.id);
      throw new UnauthorizedError();
    }

    const isMatch = await bcrypt.compare(TOKEN_SECRET, apiKey.secretHash);
    if (!isMatch) throw new UnauthorizedError();
    await apiKeyDal.updateById(apiKey.id, { lastUsed: new Date() });
    const user = await userDal.findById(apiKey.userId);
    return user;
  };

  return {
    getMyApiKeys,
    createApiKey,
    deleteApiKey,
    fnValidateApiKey
  };
};
