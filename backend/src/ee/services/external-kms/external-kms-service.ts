import { KMSServiceException } from "@aws-sdk/client-kms";
import { STSServiceException } from "@aws-sdk/client-sts";
import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { OrganizationActionScope } from "@app/db/schemas";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey, KmsKeyUsage } from "@app/services/kms/kms-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TExternalKmsDALFactory } from "./external-kms-dal";
import {
  TCreateExternalKmsDTO,
  TDeleteExternalKmsDTO,
  TGetExternalKmsByIdDTO,
  TGetExternalKmsBySlugDTO,
  TListExternalKmsDTO,
  TUpdateExternalKmsDTO
} from "./external-kms-types";
import { AwsKmsProviderFactory } from "./providers/aws-kms";
import { GcpKmsProviderFactory } from "./providers/gcp-kms";
import { ExternalKmsAwsSchema, ExternalKmsGcpSchema, KmsProviders, TExternalKmsGcpSchema } from "./providers/model";

type TExternalKmsServiceFactoryDep = {
  externalKmsDAL: TExternalKmsDALFactory;
  kmsService: Pick<TKmsServiceFactory, "getOrgKmsKeyId" | "createCipherPairWithDataKey">;
  kmsDAL: Pick<TKmsKeyDALFactory, "create" | "updateById" | "findById" | "deleteById" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TExternalKmsServiceFactory = ReturnType<typeof externalKmsServiceFactory>;

export const externalKmsServiceFactory = ({
  externalKmsDAL,
  permissionService,
  licenseService,
  kmsService,
  kmsDAL
}: TExternalKmsServiceFactoryDep) => {
  const create = async ({
    provider,
    description,
    actor,
    name,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TCreateExternalKmsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Kms);
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.externalKms) {
      throw new BadRequestError({
        message: "Failed to create external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const kmsName = name ? slugify(name) : slugify(alphaNumericNanoId(8).toLowerCase());

    let sanitizedProviderInput = "";
    switch (provider.type) {
      case KmsProviders.Aws:
        {
          const externalKms = await AwsKmsProviderFactory({ inputs: provider.inputs }).catch((error) => {
            if (error instanceof STSServiceException || error instanceof KMSServiceException) {
              throw new InternalServerError({
                message: error.message ? `AWS error: ${error.message}` : ""
              });
            }

            throw error;
          });

          try {
            // if missing kms key this generate a new kms key id and returns new provider input
            const newProviderInput = await externalKms.generateInputKmsKey();
            sanitizedProviderInput = JSON.stringify(newProviderInput);

            await externalKms.validateConnection();
          } catch (error) {
            if (error instanceof BadRequestError) {
              throw error;
            }

            throw new BadRequestError({
              message: error instanceof Error ? `AWS error: ${error.message}` : "Failed to validate AWS connection"
            });
          } finally {
            await externalKms.cleanup();
          }
        }
        break;
      case KmsProviders.Gcp:
        {
          const externalKms = await GcpKmsProviderFactory({ inputs: provider.inputs });
          try {
            await externalKms.validateConnection();
            sanitizedProviderInput = JSON.stringify(provider.inputs);
          } catch (error) {
            if (error instanceof BadRequestError) {
              throw error;
            }

            throw new BadRequestError({
              message: error instanceof Error ? `GCP error: ${error.message}` : "Failed to validate GCP connection"
            });
          } finally {
            await externalKms.cleanup();
          }
        }
        break;
      default:
        throw new BadRequestError({ message: "external kms provided is invalid" });
    }

    const { encryptor: orgDataKeyEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });

    const { cipherTextBlob: encryptedProviderInputs } = orgDataKeyEncryptor({
      plainText: Buffer.from(sanitizedProviderInput)
    });

    const externalKms = await externalKmsDAL.transaction(async (tx) => {
      const kms = await kmsDAL.create(
        {
          isReserved: false,
          description,
          keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
          name: kmsName,
          orgId: actorOrgId
        },
        tx
      );
      const externalKmsCfg = await externalKmsDAL.create(
        {
          provider: provider.type,
          encryptedProviderInputs,
          kmsKeyId: kms.id
        },
        tx
      );
      return { ...kms, external: externalKmsCfg };
    });

    return externalKms;
  };

  const updateById = async ({
    provider,
    description,
    actor,
    id: kmsId,
    name,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TUpdateExternalKmsDTO) => {
    const kmsDoc = await kmsDAL.findById(kmsId);
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: kmsDoc.orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Kms);

    const plan = await licenseService.getPlan(kmsDoc.orgId);
    if (!plan.externalKms) {
      throw new BadRequestError({
        message: "Failed to update external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const kmsName = name ? slugify(name) : undefined;

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new NotFoundError({ message: `External KMS with ID '${kmsId}' not found` });

    let sanitizedProviderInput = "";
    const { encryptor: orgDataKeyEncryptor, decryptor: orgDataKeyDecryptor } =
      await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: actorOrgId
      });
    if (provider) {
      const decryptedProviderInputBlob = orgDataKeyDecryptor({
        cipherTextBlob: externalKmsDoc.encryptedProviderInputs
      });

      switch (provider.type) {
        case KmsProviders.Aws:
          {
            const decryptedProviderInput = await ExternalKmsAwsSchema.parseAsync(
              JSON.parse(decryptedProviderInputBlob.toString())
            );
            const updatedProviderInput = { ...decryptedProviderInput, ...provider.inputs };
            const externalKms = await AwsKmsProviderFactory({ inputs: updatedProviderInput });
            try {
              await externalKms.validateConnection();
              sanitizedProviderInput = JSON.stringify(updatedProviderInput);
            } catch (error) {
              if (error instanceof BadRequestError) {
                throw error;
              }

              throw new BadRequestError({
                message: error instanceof Error ? `AWS error: ${error.message}` : "Failed to validate AWS connection"
              });
            } finally {
              await externalKms.cleanup();
            }
          }
          break;
        case KmsProviders.Gcp:
          {
            const decryptedProviderInput = await ExternalKmsGcpSchema.parseAsync(
              JSON.parse(decryptedProviderInputBlob.toString())
            );
            const updatedProviderInput = { ...decryptedProviderInput, ...provider.inputs };
            const externalKms = await GcpKmsProviderFactory({ inputs: updatedProviderInput });
            try {
              await externalKms.validateConnection();
              sanitizedProviderInput = JSON.stringify(updatedProviderInput);
            } catch (error) {
              if (error instanceof BadRequestError) {
                throw error;
              }

              throw new BadRequestError({
                message: error instanceof Error ? `GCP error: ${error.message}` : "Failed to validate GCP connection"
              });
            } finally {
              await externalKms.cleanup();
            }
          }
          break;
        default:
          throw new BadRequestError({ message: "external kms provided is invalid" });
      }
    }

    let encryptedProviderInputs: Buffer | undefined;
    if (sanitizedProviderInput) {
      const { cipherTextBlob } = orgDataKeyEncryptor({
        plainText: Buffer.from(sanitizedProviderInput)
      });
      encryptedProviderInputs = cipherTextBlob;
    }

    const externalKms = await externalKmsDAL.transaction(async (tx) => {
      const kms = await kmsDAL.updateById(
        kmsDoc.id,
        {
          description,
          name: kmsName
        },
        tx
      );
      if (encryptedProviderInputs) {
        const externalKmsCfg = await externalKmsDAL.updateById(
          externalKmsDoc.id,
          {
            encryptedProviderInputs
          },
          tx
        );
        return { ...kms, external: externalKmsCfg };
      }
      return { ...kms, external: externalKmsDoc };
    });

    return externalKms;
  };

  const deleteById = async ({ actor, id: kmsId, actorId, actorOrgId, actorAuthMethod }: TDeleteExternalKmsDTO) => {
    const kmsDoc = await kmsDAL.findById(kmsId);
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: kmsDoc.orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Kms);

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new NotFoundError({ message: `External KMS with ID '${kmsId}' not found` });

    const externalKms = await externalKmsDAL.transaction(async (tx) => {
      const kms = await kmsDAL.deleteById(kmsDoc.id, tx);
      return { ...kms, external: externalKmsDoc };
    });

    return externalKms;
  };

  const list = async ({ actor, actorId, actorOrgId, actorAuthMethod }: TListExternalKmsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    const externalKmsDocs = await externalKmsDAL.find({ orgId: actorOrgId });

    return externalKmsDocs;
  };

  const findById = async ({ actor, actorId, actorOrgId, actorAuthMethod, id: kmsId }: TGetExternalKmsByIdDTO) => {
    const kmsDoc = await kmsDAL.findById(kmsId);
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: kmsDoc.orgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new NotFoundError({ message: `External KMS with ID '${kmsId}' not found` });

    const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });

    const decryptedProviderInputBlob = orgDataKeyDecryptor({
      cipherTextBlob: externalKmsDoc.encryptedProviderInputs
    });
    switch (externalKmsDoc.provider) {
      case KmsProviders.Aws: {
        const decryptedProviderInput = await ExternalKmsAwsSchema.parseAsync(
          JSON.parse(decryptedProviderInputBlob.toString())
        );
        return { ...kmsDoc, external: { ...externalKmsDoc, providerInput: decryptedProviderInput } };
      }
      case KmsProviders.Gcp: {
        const decryptedProviderInput = await ExternalKmsGcpSchema.parseAsync(
          JSON.parse(decryptedProviderInputBlob.toString())
        );

        return { ...kmsDoc, external: { ...externalKmsDoc, providerInput: decryptedProviderInput } };
      }
      default:
        throw new BadRequestError({ message: "external kms provided is invalid" });
    }
  };

  const findByName = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    name: kmsName
  }: TGetExternalKmsBySlugDTO) => {
    const kmsDoc = await kmsDAL.findOne({ name: kmsName, orgId: actorOrgId });
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: kmsDoc.orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new NotFoundError({ message: `External KMS with ID '${kmsDoc.id}' not found` });

    const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });

    const decryptedProviderInputBlob = orgDataKeyDecryptor({
      cipherTextBlob: externalKmsDoc.encryptedProviderInputs
    });

    switch (externalKmsDoc.provider) {
      case KmsProviders.Aws: {
        const decryptedProviderInput = await ExternalKmsAwsSchema.parseAsync(
          JSON.parse(decryptedProviderInputBlob.toString())
        );
        return { ...kmsDoc, external: { ...externalKmsDoc, providerInput: decryptedProviderInput } };
      }
      case KmsProviders.Gcp: {
        const decryptedProviderInput = await ExternalKmsGcpSchema.parseAsync(
          JSON.parse(decryptedProviderInputBlob.toString())
        );

        return { ...kmsDoc, external: { ...externalKmsDoc, providerInput: decryptedProviderInput } };
      }
      default:
        throw new BadRequestError({ message: "external kms provided is invalid" });
    }
  };

  const fetchGcpKeys = async ({ credential, gcpRegion }: Pick<TExternalKmsGcpSchema, "credential" | "gcpRegion">) => {
    const externalKms = await GcpKmsProviderFactory({ inputs: { credential, gcpRegion, keyName: "" } });
    try {
      return await externalKms.getKeysList();
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }

      throw new BadRequestError({
        message: error instanceof Error ? `GCP error: ${error.message}` : "Failed to fetch GCP keys"
      });
    } finally {
      await externalKms.cleanup();
    }
  };

  return {
    create,
    updateById,
    deleteById,
    list,
    findById,
    findByName,
    fetchGcpKeys
  };
};
