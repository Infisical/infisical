import {
  CreateAliasCommand,
  CreateKeyCommand,
  GetPublicKeyCommand,
  KeyUsageType,
  KMSClient,
  MessageType,
  ScheduleKeyDeletionCommand,
  SignCommand,
  SigningAlgorithmSpec
} from "@aws-sdk/client-kms";
import { AsnConvert } from "@peculiar/asn1-schema";
import { SubjectPublicKeyInfo } from "@peculiar/asn1-x509";

import { ProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { getPqcCrypto, isPqcAlgorithm } from "@app/lib/crypto/pqc";
import { bufferToArrayBuffer } from "@app/lib/csr/pkcs11-algorithm-map";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { asNonSharedBuffer } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";
import { ECDSA_SIGNATURE_ALGORITHMS } from "@app/services/certificate/certificate-fns";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { algorithmHashName, buildExternalCaSigner, createEphemeralKeyCache } from "../ca-signer";
import { keyAlgorithmToAlgCfg } from "../certificate-authority-fns";
import {
  AWS_KMS_KEY_SPEC_BY_ALGORITHM,
  computeMlDsaExternalMu,
  parseAwsKmsKeyArnRegion,
  resolveAwsKmsDigestSigning,
  toAwsKmsError
} from "./aws-kms-ca-key-source-fns";
import { TExternalCaKeyInput, TExternalCaKeyProvider } from "./ca-key-source-types";

const AWS_KMS_KEY_DELETION_WINDOW_DAYS = 30;

type TAwsKmsCaKeySourceDep = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

const requireAwsKmsInput = (input: TExternalCaKeyInput) => {
  if (!input.appConnectionId || !input.region) {
    throw new BadRequestError({
      message: "An AWS connection and region are required when the key source is AWS KMS."
    });
  }
  return { appConnectionId: input.appConnectionId, region: input.region };
};

export const awsKmsCaKeySourceFactory = ({
  appConnectionDAL,
  appConnectionService,
  kmsService,
  projectDAL,
  licenseService
}: TAwsKmsCaKeySourceDep): TExternalCaKeyProvider => {
  const ephemeralKeys = createEphemeralKeyCache();

  const $getKmsClient = async (appConnectionId: string, region: string) => {
    const appConnection = await appConnectionDAL.findById(appConnectionId);
    if (!appConnection) {
      throw new NotFoundError({ message: `AWS connection with ID '${appConnectionId}' not found` });
    }
    if (appConnection.app !== AppConnection.AWS) {
      throw new BadRequestError({ message: `App connection with ID '${appConnectionId}' is not an AWS connection` });
    }

    const decryptedConnection = (await decryptAppConnection(appConnection, kmsService)) as TAwsConnection;
    const awsConfig = await getAwsConnectionConfig(
      { ...decryptedConnection, projectType: ProjectType.CertificateManager },
      region as AWSRegion
    );

    return new KMSClient({
      sha256: CustomAWSHasher,
      useFipsEndpoint: crypto.isFipsModeEnabled(),
      credentials: awsConfig.credentials,
      region: awsConfig.region
    });
  };

  const $scheduleKeyDeletion = async (client: KMSClient, keyArn: string) => {
    try {
      await client.send(
        new ScheduleKeyDeletionCommand({ KeyId: keyArn, PendingWindowInDays: AWS_KMS_KEY_DELETION_WINDOW_DAYS })
      );
    } catch (error) {
      throw toAwsKmsError(error, `schedule the deletion of '${keyArn}'`);
    }
  };

  return {
    displayName: "AWS KMS",
    supportedKeyAlgorithms: Object.keys(AWS_KMS_KEY_SPEC_BY_ALGORITHM) as CertKeyAlgorithm[],

    assertCanUse: async ({ actor, projectId, input }) => {
      const { appConnectionId } = requireAwsKmsInput(input);
      await appConnectionService.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: appConnectionId, projectId },
        actor
      );
    },

    createKey: async ({ projectId, caName, keyAlgorithm, input }) => {
      const { appConnectionId, region } = requireAwsKmsInput(input);

      const project = await projectDAL.findById(projectId);
      if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
      const plan = await licenseService.getPlan(project.orgId);
      if (!plan.pkiAwsKmsSigning) {
        throw new BadRequestError({
          message:
            "Failed to create certificate authority with an AWS KMS key due to plan restriction. Upgrade plan to use AWS KMS-backed certificate authorities."
        });
      }

      const client = await $getKmsClient(appConnectionId, region);

      let keyArn: string | undefined;
      try {
        const created = await client.send(
          new CreateKeyCommand({
            KeySpec: AWS_KMS_KEY_SPEC_BY_ALGORITHM[keyAlgorithm],
            KeyUsage: KeyUsageType.SIGN_VERIFY,
            Description: `Infisical certificate authority signing key: ${caName}`,
            Tags: [
              { TagKey: "author", TagValue: "infisical" },
              { TagKey: "purpose", TagValue: "certificate-authority" }
            ]
          })
        );
        keyArn = created.KeyMetadata?.Arn;
      } catch (error) {
        throw toAwsKmsError(error, "create the CA signing key");
      }
      if (!keyArn) throw new BadRequestError({ message: "AWS KMS did not return an ARN for the new signing key." });

      try {
        const { PublicKey: publicKeySpki } = await client.send(new GetPublicKeyCommand({ KeyId: keyArn }));
        if (!publicKeySpki) {
          throw new BadRequestError({ message: `AWS KMS did not return a public key for '${keyArn}'.` });
        }
        await client
          .send(
            new CreateAliasCommand({
              AliasName: `alias/infisical-ca-${caName}-${alphaNumericNanoId(5)}`,
              TargetKeyId: keyArn
            })
          )
          .catch((aliasError: unknown) => {
            logger.warn(aliasError, `Failed to create alias for AWS KMS CA key [keyArn=${keyArn}]`);
          });
        return { appConnectionId, externalKeyId: keyArn, publicKeySpki: Buffer.from(publicKeySpki) };
      } catch (error) {
        await $scheduleKeyDeletion(client, keyArn).catch((deletionError: unknown) => {
          logger.error(deletionError, `Failed to schedule deletion of unused AWS KMS CA key [keyArn=${keyArn}]`);
        });
        throw toAwsKmsError(error, `read the public key of '${keyArn}'`);
      }
    },

    buildSigner: async ({ keyAlgorithm, reference, signatureAlgorithm }) => {
      const { appConnectionId, externalKeyId: keyArn, publicKeySpki } = reference;
      if (!appConnectionId || !keyArn || !publicKeySpki) {
        throw new BadRequestError({
          message: "AWS KMS-backed CA secret is missing its AWS connection, key ARN, or public key"
        });
      }

      let client: KMSClient | undefined;
      const sign = async (message: Buffer, messageType: MessageType, signingAlgorithm: SigningAlgorithmSpec) => {
        client ??= await $getKmsClient(appConnectionId, parseAwsKmsKeyArnRegion(keyArn));
        try {
          const { Signature } = await client.send(
            new SignCommand({
              KeyId: keyArn,
              Message: message,
              MessageType: messageType,
              SigningAlgorithm: signingAlgorithm
            })
          );
          if (!Signature) throw new BadRequestError({ message: `AWS KMS returned no signature for '${keyArn}'.` });
          return bufferToArrayBuffer(Buffer.from(Signature));
        } catch (error) {
          throw toAwsKmsError(error, `sign with '${keyArn}'`);
        }
      };

      const keyAlgCfg = keyAlgorithmToAlgCfg(keyAlgorithm);

      if (isPqcAlgorithm(keyAlgorithm)) {
        const pqcCrypto = getPqcCrypto();
        const caPublicKey = await pqcCrypto.subtle.importKey(
          "spki",
          asNonSharedBuffer(publicKeySpki),
          keyAlgCfg,
          true,
          ["verify"]
        );
        const rawPublicKey = new Uint8Array(AsnConvert.parse(publicKeySpki, SubjectPublicKeyInfo).subjectPublicKey);

        return buildExternalCaSigner({
          caPublicKey,
          signingAlgorithm: keyAlgCfg,
          generateEphemeralKey: () =>
            ephemeralKeys(keyAlgCfg, () =>
              pqcCrypto.subtle.generateKey(keyAlgCfg as RsaHashedKeyGenParams, true, ["sign", "verify"])
            ),
          signTbs: (tbs) =>
            sign(
              computeMlDsaExternalMu(rawPublicKey, tbs),
              MessageType.EXTERNAL_MU,
              SigningAlgorithmSpec.ML_DSA_SHAKE_256
            )
        });
      }

      const hash = (signatureAlgorithm && algorithmHashName(signatureAlgorithm)) || keyAlgCfg.hash;
      const { signingAlgorithmSpec, nodeHash } = resolveAwsKmsDigestSigning(keyAlgorithm, hash);
      const certSigningAlgorithm = { name: keyAlgCfg.name, hash } as Algorithm;
      const ephemeralKeyParams = { ...keyAlgCfg, hash } as RsaHashedKeyGenParams;

      const caPublicKey = await crypto.nativeCrypto.subtle.importKey(
        "spki",
        asNonSharedBuffer(publicKeySpki),
        keyAlgCfg,
        true,
        ["verify"]
      );

      return buildExternalCaSigner({
        caPublicKey,
        signingAlgorithm: certSigningAlgorithm,
        generateEphemeralKey: () =>
          ephemeralKeys(ephemeralKeyParams, () =>
            crypto.nativeCrypto.subtle.generateKey(ephemeralKeyParams, true, ["sign", "verify"])
          ),
        signTbs: (tbs) =>
          sign(crypto.nativeCrypto.createHash(nodeHash).update(tbs).digest(), MessageType.DIGEST, signingAlgorithmSpec)
      });
    },

    requiredSignatureAlgorithm: (keyAlgorithm) => {
      const keyAlgCfg = keyAlgorithmToAlgCfg(keyAlgorithm);
      return keyAlgCfg.name === "ECDSA" ? ECDSA_SIGNATURE_ALGORITHMS[keyAlgCfg.hash] : undefined;
    },

    describeKey: async ({ reference }) => {
      const { appConnectionId, externalKeyId: keyArn } = reference;
      const appConnection = appConnectionId ? await appConnectionDAL.findById(appConnectionId) : undefined;
      return {
        appConnectionId: appConnectionId ?? undefined,
        appConnectionName: appConnection?.name,
        externalKeyId: keyArn ?? undefined,
        region: keyArn ? parseAwsKmsKeyArnRegion(keyArn) : undefined
      };
    },

    prepareKeyRelease: async ({ reference }) => {
      const { appConnectionId, externalKeyId: keyArn } = reference;
      if (!appConnectionId || !keyArn) return async () => {};

      const client = await $getKmsClient(appConnectionId, parseAwsKmsKeyArnRegion(keyArn));
      return () => $scheduleKeyDeletion(client, keyArn);
    }
  };
};
