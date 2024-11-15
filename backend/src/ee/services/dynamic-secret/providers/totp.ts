import { authenticator } from "otplib";
import { HashAlgorithms } from "otplib/core";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretTotpSchema, TDynamicProviderFns } from "./models";

export const TotpProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretTotpSchema.parseAsync(inputs);

    const urlObj = new URL(providerInputs.url);
    const secret = urlObj.searchParams.get("secret");
    if (!secret) {
      throw new BadRequestError({
        message: "TOTP secret is missing from URL"
      });
    }

    return providerInputs;
  };

  const validateConnection = async () => {
    return true;
  };

  const create = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);

    const entityId = alphaNumericNanoId(32);
    const authenticatorInstance = authenticator.clone();

    const urlObj = new URL(providerInputs.url);
    const secret = urlObj.searchParams.get("secret") as string;
    const periodFromUrl = urlObj.searchParams.get("period");
    const digitsFromUrl = urlObj.searchParams.get("digits");
    const algorithm = urlObj.searchParams.get("algorithm");

    authenticatorInstance.options = {
      digits: digitsFromUrl ? +digitsFromUrl : undefined,
      algorithm: algorithm ? (algorithm.toLowerCase() as HashAlgorithms) : undefined,
      step: periodFromUrl ? +periodFromUrl : undefined
    };

    return { entityId, data: { TOTP: authenticatorInstance.generate(secret) } };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    return { entityId };
  };

  const renew = async (inputs: unknown, entityId: string) => {
    return { entityId };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
