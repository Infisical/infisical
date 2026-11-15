import { TCertificateAuthoritySecret } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CertKeySource } from "@app/services/signer/signer-enums";

import { TCertificateAuthoritySecretDALFactory } from "../certificate-authority-secret-dal";
import { awsKmsCaKeySourceFactory } from "./aws-kms-ca-key-source";
import { isExternalCaKeySource } from "./ca-key-source-fns";
import {
  TCaKeyDetails,
  TExternalCaKeyInput,
  TExternalCaKeyProvider,
  TExternalCaKeyReference,
  TExternalCaKeySource
} from "./ca-key-source-types";
import { hsmCaKeySourceFactory } from "./hsm-ca-key-source";

type TCaKeySourceServiceFactoryDep = Parameters<typeof hsmCaKeySourceFactory>[0] &
  Parameters<typeof awsKmsCaKeySourceFactory>[0] & {
    certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  };

export type TCaKeySourceServiceFactory = ReturnType<typeof caKeySourceServiceFactory>;

export const caKeySourceServiceFactory = (deps: TCaKeySourceServiceFactoryDep) => {
  const providers: Record<TExternalCaKeySource, TExternalCaKeyProvider> = {
    [CertKeySource.Hsm]: hsmCaKeySourceFactory(deps),
    [CertKeySource.AwsKms]: awsKmsCaKeySourceFactory(deps)
  };

  const $getProvider = (keySource: TExternalCaKeySource) => {
    const provider = providers[keySource];
    if (!provider)
      throw new BadRequestError({ message: `Unsupported certificate authority key source '${keySource}'` });
    return provider;
  };

  const assertCanUse = (args: {
    keySource: TExternalCaKeySource;
    actor: OrgServiceActor;
    projectId: string;
    input: TExternalCaKeyInput;
  }) => $getProvider(args.keySource).assertCanUse(args);

  const createKey = async (args: {
    keySource: TExternalCaKeySource;
    projectId: string;
    caName: string;
    keyAlgorithm: CertKeyAlgorithm;
    input: TExternalCaKeyInput;
  }) => {
    const provider = $getProvider(args.keySource);
    if (!provider.supportedKeyAlgorithms.includes(args.keyAlgorithm)) {
      throw new BadRequestError({
        message: `Key algorithm '${args.keyAlgorithm}' is not supported for ${provider.displayName}-backed certificate authorities. Supported algorithms: ${provider.supportedKeyAlgorithms.join(", ")}.`
      });
    }
    return provider.createKey(args);
  };

  const buildSigner = (args: {
    keySource: TExternalCaKeySource;
    projectId: string;
    keyAlgorithm: CertKeyAlgorithm;
    reference: Partial<TExternalCaKeyReference>;
    signatureAlgorithm?: Algorithm;
  }) => $getProvider(args.keySource).buildSigner(args);

  const describeKey = async (
    caSecret?: (Pick<TCertificateAuthoritySecret, "keySource"> & Partial<TExternalCaKeyReference>) | null
  ): Promise<TCaKeyDetails & { keySource: CertKeySource }> => {
    const keySource = (caSecret?.keySource as CertKeySource | undefined) ?? CertKeySource.Infisical;
    if (!caSecret || !isExternalCaKeySource(keySource)) return { keySource };
    return { keySource, ...(await $getProvider(keySource).describeKey({ reference: caSecret })) };
  };

  const prepareKeyReleases = async (
    caSecrets: ({ keySource: string; caId?: string } & Partial<TExternalCaKeyReference>)[]
  ) => {
    const logContext = (caSecret: (typeof caSecrets)[number]) =>
      `[caId=${caSecret.caId}] [keySource=${caSecret.keySource}] [externalKeyId=${caSecret.externalKeyId}]`;

    const releases = await Promise.all(
      caSecrets.map(async (caSecret) => {
        if (!isExternalCaKeySource(caSecret.keySource)) return undefined;
        const { prepareKeyRelease } = $getProvider(caSecret.keySource);
        if (!prepareKeyRelease) return undefined;
        try {
          return { caSecret, release: await prepareKeyRelease({ reference: caSecret }) };
        } catch (error) {
          logger.error(
            error,
            `Failed to prepare the release of a certificate authority signing key ${logContext(caSecret)}`
          );
          return undefined;
        }
      })
    );

    return async () => {
      await Promise.all(
        releases.map(async (prepared) => {
          if (!prepared) return;
          await prepared.release().catch((error: unknown) => {
            logger.error(
              error,
              `Failed to release a certificate authority signing key ${logContext(prepared.caSecret)}`
            );
          });
        })
      );
    };
  };

  const resolveCsrSignatureAlgorithm = async ({
    caId,
    keyAlgorithm,
    csrSignatureAlgorithm
  }: {
    caId: string;
    keyAlgorithm: CertKeyAlgorithm;
    csrSignatureAlgorithm?: string;
  }): Promise<string | undefined> => {
    const caSecret = await deps.certificateAuthoritySecretDAL.findOne({ caId });
    if (!caSecret || !isExternalCaKeySource(caSecret.keySource)) return csrSignatureAlgorithm;
    return $getProvider(caSecret.keySource).requiredSignatureAlgorithm?.(keyAlgorithm) ?? csrSignatureAlgorithm;
  };

  return { assertCanUse, createKey, buildSigner, describeKey, prepareKeyReleases, resolveCsrSignatureAlgorithm };
};
