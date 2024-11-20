import { authenticator } from "otplib";
import { HashAlgorithms } from "otplib/core";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretTotpSchema, TDynamicProviderFns, TotpConfigType } from "./models";

export const TotpProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretTotpSchema.parseAsync(inputs);

    return providerInputs;
  };

  const validateConnection = async () => {
    return true;
  };

  const create = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);

    const entityId = alphaNumericNanoId(32);
    const authenticatorInstance = authenticator.clone();

    let secret: string;
    let period: number | null | undefined;
    let digits: number | null | undefined;
    let algorithm: HashAlgorithms | null | undefined;

    if (providerInputs.configType === TotpConfigType.URL) {
      const urlObj = new URL(providerInputs.url);
      secret = urlObj.searchParams.get("secret") as string;
      const periodFromUrl = urlObj.searchParams.get("period");
      const digitsFromUrl = urlObj.searchParams.get("digits");
      const algorithmFromUrl = urlObj.searchParams.get("algorithm");

      if (periodFromUrl) {
        period = +periodFromUrl;
      }

      if (digitsFromUrl) {
        digits = +digitsFromUrl;
      }

      if (algorithmFromUrl) {
        algorithm = algorithmFromUrl.toLowerCase() as HashAlgorithms;
      }
    } else {
      secret = providerInputs.secret;
      period = providerInputs.period;
      digits = providerInputs.digits;
      algorithm = providerInputs.algorithm as unknown as HashAlgorithms;
    }

    if (digits) {
      authenticatorInstance.options = { digits };
    }

    if (algorithm) {
      authenticatorInstance.options = { algorithm };
    }

    if (period) {
      authenticatorInstance.options = { step: period };
    }

    return { entityId, data: { TOTP: authenticatorInstance.generate(secret) } };
  };

  const revoke = async (_inputs: unknown, entityId: string) => {
    return { entityId };
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const renew = async (_inputs: unknown, _entityId: string) => {
    throw new BadRequestError({
      message: "Lease renewal is not supported for TOTPs"
    });
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
