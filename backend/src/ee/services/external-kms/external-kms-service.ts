import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

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
  kmsService: Pick<TKmsServiceFactory, "getOrgKmsKeyId" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  kmsDAL: Pick<TKmsKeyDALFactory, "create" | "updateById" | "findById" | "deleteById" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TExternalKmsServiceFactory = ReturnType<typeof externalKmsServiceFactory>;

export const externalKmsServiceFactory = ({
  externalKmsDAL,
  permissionService,
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
    const kmsSlug = slug ? slugify(slug) : slugify(alphaNumericNanoId(32));

    let sanitizedProviderInput = "";
    switch (provider.type) {
      case KmsProviders.Aws:
        {
          const externalKms = await AwsKmsProviderFactory({ inputs: provider.inputs });
          await externalKms.validateConnection();
          // if missing kms key this generate a new kms key id and returns new provider input
          const newProviderInput = await externalKms.generateInputKmsKey();
          sanitizedProviderInput = JSON.stringify(newProviderInput);
        }
        break;
      default:
        throw new BadRequestError({ message: "external kms provided is invalid" });
    }

    const orgKmsKeyId = await kmsService.getOrgKmsKeyId(actorOrgId);
    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: orgKmsKeyId
    });
    const { cipherTextBlob: encryptedProviderInputs } = kmsEncryptor({
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
    const kmsSlug = slug ? slugify(slug) : undefined;

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new BadRequestError({ message: "External kms not found" });

    const orgDefaultKmsId = await kmsService.getOrgKmsKeyId(kmsDoc.orgId);
    let sanitizedProviderInput = "";
    if (provider) {
      const kmsDecryptor = await kmsService.decryptWithKmsKey({
        kmsId: orgDefaultKmsId
      });
      const decryptedProviderInputBlob = kmsDecryptor({
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
      const kmsEncryptor = await kmsService.encryptWithKmsKey({
        kmsId: orgDefaultKmsId
      });
      const { cipherTextBlob } = kmsEncryptor({
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new BadRequestError({ message: "External kms not found" });

    const orgDefaultKmsId = await kmsService.getOrgKmsKeyId(kmsDoc.orgId);
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: orgDefaultKmsId
    });
    const decryptedProviderInputBlob = kmsDecryptor({
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const externalKmsDoc = await externalKmsDAL.findOne({ kmsKeyId: kmsDoc.id });
    if (!externalKmsDoc) throw new BadRequestError({ message: "External kms not found" });

    const orgDefaultKmsId = await kmsService.getOrgKmsKeyId(kmsDoc.orgId);
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: orgDefaultKmsId
    });
    const decryptedProviderInputBlob = kmsDecryptor({
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
