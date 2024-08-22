import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
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
import { ExternalKmsAwsSchema, KmsProviders } from "./providers/model";

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
    slug,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TCreateExternalKmsDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Kms);
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.externalKms) {
      throw new BadRequestError({
        message: "Failed to create external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const kmsSlug = slug ? slugify(slug) : slugify(alphaNumericNanoId(8).toLowerCase());

    let sanitizedProviderInput = "";
    switch (provider.type) {
      case KmsProviders.Aws:
        {
          const externalKms = await AwsKmsProviderFactory({ inputs: provider.inputs });
          // if missing kms key this generate a new kms key id and returns new provider input
          const newProviderInput = await externalKms.generateInputKmsKey();
          sanitizedProviderInput = JSON.stringify(newProviderInput);

          await externalKms.validateConnection();
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
      plainText: Buffer.from(sanitizedProviderInput, "utf8")
    });

    const externalKms = await externalKmsDAL.transaction(async (tx) => {
      const kms = await kmsDAL.create(
        {
          isReserved: false,
          description,
          slug: kmsSlug,
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
    slug,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TUpdateExternalKmsDTO) => {
    const kmsDoc = await kmsDAL.findById(kmsId);
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      kmsDoc.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Kms);

    const plan = await licenseService.getPlan(kmsDoc.orgId);
    if (!plan.externalKms) {
      throw new BadRequestError({
        message: "Failed to update external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    const kmsSlug = slug ? slugify(slug) : undefined;

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new BadRequestError({ message: "External kms not found" });

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
              JSON.parse(decryptedProviderInputBlob.toString("utf8"))
            );
            const updatedProviderInput = { ...decryptedProviderInput, ...provider.inputs };
            const externalKms = await AwsKmsProviderFactory({ inputs: updatedProviderInput });
            await externalKms.validateConnection();
            sanitizedProviderInput = JSON.stringify(updatedProviderInput);
          }
          break;
        default:
          throw new BadRequestError({ message: "external kms provided is invalid" });
      }
    }

    let encryptedProviderInputs: Buffer | undefined;
    if (sanitizedProviderInput) {
      const { cipherTextBlob } = orgDataKeyEncryptor({
        plainText: Buffer.from(sanitizedProviderInput, "utf8")
      });
      encryptedProviderInputs = cipherTextBlob;
    }

    const externalKms = await externalKmsDAL.transaction(async (tx) => {
      const kms = await kmsDAL.updateById(
        kmsDoc.id,
        {
          description,
          slug: kmsSlug
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
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      kmsDoc.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Kms);

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new BadRequestError({ message: "External kms not found" });

    const externalKms = await externalKmsDAL.transaction(async (tx) => {
      const kms = await kmsDAL.deleteById(kmsDoc.id, tx);
      return { ...kms, external: externalKmsDoc };
    });

    return externalKms;
  };

  const list = async ({ actor, actorId, actorOrgId, actorAuthMethod }: TListExternalKmsDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    const externalKmsDocs = await externalKmsDAL.find({ orgId: actorOrgId });

    return externalKmsDocs;
  };

  const findById = async ({ actor, actorId, actorOrgId, actorAuthMethod, id: kmsId }: TGetExternalKmsByIdDTO) => {
    const kmsDoc = await kmsDAL.findById(kmsId);
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      kmsDoc.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new BadRequestError({ message: "External kms not found" });

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
          JSON.parse(decryptedProviderInputBlob.toString("utf8"))
        );
        return { ...kmsDoc, external: { ...externalKmsDoc, providerInput: decryptedProviderInput } };
      }
      default:
        throw new BadRequestError({ message: "external kms provided is invalid" });
    }
  };

  const findBySlug = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    slug: kmsSlug
  }: TGetExternalKmsBySlugDTO) => {
    const kmsDoc = await kmsDAL.findOne({ slug: kmsSlug, orgId: actorOrgId });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      kmsDoc.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new BadRequestError({ message: "External kms not found" });

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
          JSON.parse(decryptedProviderInputBlob.toString("utf8"))
        );
        return { ...kmsDoc, external: { ...externalKmsDoc, providerInput: decryptedProviderInput } };
      }
      default:
        throw new BadRequestError({ message: "external kms provided is invalid" });
    }
  };

  return {
    create,
    updateById,
    deleteById,
    list,
    findById,
    findBySlug
  };
};
