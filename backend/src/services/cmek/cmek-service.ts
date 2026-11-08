import { ForbiddenError, MongoAbility, MongoQuery } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import {
  KmsCiphertextUndecryptableError,
  KmsKeyOrderBy,
  KmsKeyUsage,
  TKmsCoreDomain,
  TKmsKeyDetails
} from "@app/domains/platform/kms-core/ce/module";
import { TLicenseDomain } from "@app/domains/platform/license/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCmekActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  AsymmetricKeyAlgorithm,
  getSigningAlgorithmsForKeyAlgorithm,
  isPqcKeyAlgorithm,
  signingService
} from "@app/lib/crypto/sign";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import {
  TCmekBulkGetPrivateKeysDTO,
  TCmekBulkImportKeysDTO,
  TCmekBulkImportKeysResult,
  TCmekDecryptDTO,
  TCmekEncryptDTO,
  TCmekGenerateMacDTO,
  TCmekGetPrivateKeyDTO,
  TCmekGetPublicKeyDTO,
  TCmekListSigningAlgorithmsDTO,
  TCmekSignDTO,
  TCmekVerifyDTO,
  TCmekVerifyMacDTO,
  TCreateCmekDTO,
  TListCmeksByProjectIdDTO,
  TUpdabteCmekByIdDTO
} from "@app/services/cmek/cmek-types";

type TCmekServiceFactoryDep = {
  kmsCoreDomain: TKmsCoreDomain;
  permissionService: TPermissionServiceFactory;
  licenseDomain: TLicenseDomain;
};

export type TCmekServiceFactory = ReturnType<typeof cmekServiceFactory>;

// A customer managed key: a project key that is not reserved and holds internal material.
const toCmek = ({ isExternal, ...key }: TKmsKeyDetails) => ({
  ...key,
  encryptionAlgorithm: key.encryptionAlgorithm as string,
  version: key.version as number
});

const isCmek = (key: TKmsKeyDetails | undefined): key is TKmsKeyDetails =>
  Boolean(key && !key.isReserved && !key.isExternal);

export const cmekServiceFactory = ({ kmsCoreDomain, permissionService, licenseDomain }: TCmekServiceFactoryDep) => {
  const $findCmekById = async (keyId: string) => {
    const key = await kmsCoreDomain.findKeyById(keyId);
    return isCmek(key) ? toCmek(key) : undefined;
  };

  const $findCmekByName = async (name: string, projectId: string) => {
    const [key] = await kmsCoreDomain.findKeys({ name, projectId, isReserved: false });
    return isCmek(key) ? toCmek(key) : undefined;
  };

  // A public key is not secret, and verifying outside Infisical needs it, so anyone who may sign or verify with the
  // key can read it and its signing algorithms without being able to list or look up the project's keys.
  const $throwUnlessCanReadPublicKeyInfo = (permission: MongoAbility<ProjectPermissionSet, MongoQuery>) => {
    const canReadPublicKeyInfo = [
      ProjectPermissionCmekActions.Read,
      ProjectPermissionCmekActions.Sign,
      ProjectPermissionCmekActions.Verify
    ].some((action) => permission.can(action, ProjectPermissionSub.Cmek));

    if (!canReadPublicKeyInfo) {
      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);
    }
  };

  const createCmek = async ({ projectId, ...dto }: TCreateCmekDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Create, ProjectPermissionSub.Cmek);

    if (isPqcKeyAlgorithm(dto.encryptionAlgorithm as string)) {
      const plan = await licenseDomain.getPlan(dto.orgId);
      if (!plan.kmsPqc) {
        throw new BadRequestError({
          message:
            "Your license does not include PQC algorithms. Please upgrade to the Enterprise plan to use a PQC algorithm."
        });
      }
    }

    try {
      const cmek = await kmsCoreDomain.generateKmsKey({
        ...dto,
        projectId,
        isReserved: false
      });

      return {
        ...cmek,
        version: 1,
        encryptionAlgorithm: dto.encryptionAlgorithm
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A KMS key with the name "${dto.name}" already exists for the project with ID "${projectId}"`
        });
      }

      throw err;
    }
  };

  const updateCmekById = async ({ keyId, ...data }: TUpdabteCmekByIdDTO, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Edit, ProjectPermissionSub.Cmek);

    try {
      const cmek = await kmsCoreDomain.updateKeyAttributes(keyId, data);

      return {
        ...cmek,
        version: key.version,
        encryptionAlgorithm: key.encryptionAlgorithm
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A KMS key with the name "${data.name!}" already exists for the project with ID "${key.projectId}"`
        });
      }

      throw err;
    }
  };

  const rotateCmekById = async (keyId: string, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Rotate, ProjectPermissionSub.Cmek);

    const { version } = await kmsCoreDomain.rotateKmsKey(keyId);

    return {
      ...key,
      version
    };
  };

  const deleteCmekById = async (keyId: string, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Delete, ProjectPermissionSub.Cmek);

    const deletedKey = await kmsCoreDomain.deleteKey(keyId);

    if (!deletedKey) {
      throw new BadRequestError({
        message: `Key with ID ${keyId} has delete protection enabled. Disable delete protection on the key before deleting it.`
      });
    }

    return key;
  };

  const listCmeksByProjectId = async ({ projectId, ...filters }: TListCmeksByProjectIdDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    const { keys, totalCount } = await kmsCoreDomain.listProjectKeys({
      projectId,
      ...filters,
      orderBy: filters.orderBy as unknown as KmsKeyOrderBy | undefined
    });

    return { cmeks: keys.map(toCmek), totalCount };
  };

  const findCmekById = async (keyId: string, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    return key;
  };

  const findCmekByName = async (keyName: string, projectId: string, actor: OrgServiceActor) => {
    const key = await $findCmekByName(keyName, projectId);

    if (!key || key.orgId !== actor.orgId)
      throw new NotFoundError({ message: `Key with name "${keyName}" not found for project with ID "${projectId}"` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    return key;
  };

  const cmekEncrypt = async ({ keyId, plaintext }: TCmekEncryptDTO, actor: OrgServiceActor) => {
    const key = await kmsCoreDomain.findKeyById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Encrypt, ProjectPermissionSub.Cmek);

    const encrypt = await kmsCoreDomain.encryptWithKmsKey({ kmsId: keyId });

    const { cipherTextBlob } = await encrypt({ plainText: Buffer.from(plaintext, "base64") });

    return {
      ciphertext: cipherTextBlob.toString("base64"),
      projectId: key.projectId
    };
  };

  const listSigningAlgorithms = async ({ keyId }: TCmekListSigningAlgorithmsDTO, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });
    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });
    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    $throwUnlessCanReadPublicKeyInfo(permission);

    if (key.keyUsage !== KmsKeyUsage.SIGN_VERIFY) {
      throw new BadRequestError({ message: `Key with ID '${keyId}' is not intended for signing` });
    }

    const signingAlgorithms = getSigningAlgorithmsForKeyAlgorithm(key.encryptionAlgorithm as AsymmetricKeyAlgorithm);
    if (signingAlgorithms.length === 0) {
      throw new BadRequestError({ message: `Unsupported encryption algorithm: ${key.encryptionAlgorithm}` });
    }

    return { signingAlgorithms, projectId: key.projectId };
  };

  const getPublicKey = async ({ keyId }: TCmekGetPublicKeyDTO, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });
    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });
    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    $throwUnlessCanReadPublicKeyInfo(permission);

    const publicKey = await kmsCoreDomain.getPublicKey({ kmsId: keyId });
    return { publicKey: publicKey.toString("base64"), projectId: key.projectId, keyName: key.name };
  };

  const getPrivateKey = async ({ keyId }: TCmekGetPrivateKeyDTO, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });
    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });
    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCmekActions.ExportPrivateKey,
      ProjectPermissionSub.Cmek
    );

    if (!key.isExportable) throw new BadRequestError({ message: "You are not allowed to export this key" });

    const keyMaterial = await kmsCoreDomain.getKeyMaterial({ kmsId: keyId });

    return {
      privateKey: keyMaterial.toString("base64"),
      projectId: key.projectId,
      keyName: key.name
    };
  };

  const bulkGetPrivateKeys = async ({ keyIds }: TCmekBulkGetPrivateKeysDTO, actor: OrgServiceActor) => {
    if (keyIds.length === 0) throw new BadRequestError({ message: "At least one key ID is required" });

    const uniqueKeyIds = [...new Set(keyIds)];
    const keys = (await kmsCoreDomain.findKeys({ ids: uniqueKeyIds, isReserved: false }))
      .filter(isCmek)
      .map(toCmek)
      .filter((key) => key.orgId === actor.orgId);

    if (keys.length === 0) throw new NotFoundError({ message: "No keys found for the provided IDs" });

    if (keys.length !== uniqueKeyIds.length) {
      const foundIds = new Set(keys.map((k) => k.id));
      const missingIds = uniqueKeyIds.filter((id) => !foundIds.has(id));
      throw new NotFoundError({ message: `Keys not found for IDs: ${missingIds.join(", ")}` });
    }

    const projectIds = new Set<string>();
    for (const key of keys) {
      if (!key.projectId || key.isReserved)
        throw new BadRequestError({ message: `Key with ID "${key.id}" is not customer managed` });
      if (key.isDisabled) throw new BadRequestError({ message: `Key with ID "${key.id}" is disabled` });
      projectIds.add(key.projectId);
    }

    if (projectIds.size > 1) throw new BadRequestError({ message: "All keys must belong to the same project" });

    const projectId = keys[0].projectId!;

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCmekActions.ExportPrivateKey,
      ProjectPermissionSub.Cmek
    );

    for (const key of keys) {
      if (!key.isExportable) throw new BadRequestError({ message: "You are not allowed to export this key" });
    }

    const bulkMaterials = await kmsCoreDomain.getBulkKeyMaterial({ kmsIds: keys.map((k) => k.id) });

    const materialByKmsId = new Map(bulkMaterials.map((m) => [m.kmsId, m]));
    const asymmetricAlgorithms = new Set<string>(Object.values(AsymmetricKeyAlgorithm));

    const result = await Promise.all(
      keys.map(async (key) => {
        const materialEntry = materialByKmsId.get(key.id);

        if (!materialEntry) {
          throw new NotFoundError({ message: `Key material not found for key ID "${key.id}"` });
        }

        let publicKey: string | undefined;
        if (asymmetricAlgorithms.has(key.encryptionAlgorithm)) {
          const pubKeyBuffer = await signingService(
            key.encryptionAlgorithm as AsymmetricKeyAlgorithm
          ).getPublicKeyFromPrivateKey(materialEntry.keyMaterial);
          publicKey = pubKeyBuffer.toString("base64");
        }

        return {
          keyId: key.id,
          name: key.name,
          keyUsage: key.keyUsage,
          algorithm: key.encryptionAlgorithm,
          privateKey: materialEntry.keyMaterial.toString("base64"),
          ...(publicKey ? { publicKey } : {})
        };
      })
    );

    return { keys: result, projectId };
  };

  const cmekSign = async ({ keyId, data, signingAlgorithm, isDigest }: TCmekSignDTO, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Sign, ProjectPermissionSub.Cmek);

    const sign = await kmsCoreDomain.signWithKmsKey({ kmsId: keyId });

    const { signature, algorithm } = await sign({ data: Buffer.from(data, "base64"), signingAlgorithm, isDigest });

    return {
      signature: signature.toString("base64"),
      keyId: key.id,
      projectId: key.projectId,
      signingAlgorithm: algorithm
    };
  };

  const cmekVerify = async (
    { keyId, data, signature, signingAlgorithm, isDigest }: TCmekVerifyDTO,
    actor: OrgServiceActor
  ) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Verify, ProjectPermissionSub.Cmek);

    const verify = await kmsCoreDomain.verifyWithKmsKey({ kmsId: keyId, signingAlgorithm });

    const { signatureValid, algorithm } = await verify({
      isDigest,
      data: Buffer.from(data, "base64"),
      signature: Buffer.from(signature, "base64")
    });

    return {
      signatureValid,
      keyId: key.id,
      projectId: key.projectId,
      signingAlgorithm: algorithm
    };
  };

  const cmekGenerateMac = async ({ keyId, data }: TCmekGenerateMacDTO, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.GenerateMac, ProjectPermissionSub.Cmek);

    if (key.keyUsage !== KmsKeyUsage.GENERATE_VERIFY_MAC) {
      throw new BadRequestError({ message: `Key with ID '${keyId}' is not intended for MAC generation` });
    }

    const generate = await kmsCoreDomain.generateMac({ kmsId: keyId });

    const { mac, algorithm } = generate({ data: Buffer.from(data, "base64") });

    return {
      mac: mac.toString("base64"),
      keyId: key.id,
      projectId: key.projectId,
      macAlgorithm: algorithm
    };
  };

  const cmekVerifyMac = async ({ keyId, data, mac }: TCmekVerifyMacDTO, actor: OrgServiceActor) => {
    const key = await $findCmekById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.VerifyMac, ProjectPermissionSub.Cmek);

    if (key.keyUsage !== KmsKeyUsage.GENERATE_VERIFY_MAC) {
      throw new BadRequestError({ message: `Key with ID '${keyId}' is not intended for MAC verification` });
    }

    const verify = await kmsCoreDomain.verifyMac({ kmsId: keyId });

    const { macValid, algorithm } = verify({
      data: Buffer.from(data, "base64"),
      mac: Buffer.from(mac, "base64")
    });

    return {
      macValid,
      keyId: key.id,
      projectId: key.projectId,
      macAlgorithm: algorithm
    };
  };

  const cmekDecrypt = async ({ keyId, ciphertext }: TCmekDecryptDTO, actor: OrgServiceActor) => {
    const key = await kmsCoreDomain.findKeyById(keyId);

    if (!key || key.orgId !== actor.orgId) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Decrypt, ProjectPermissionSub.Cmek);

    const decrypt = await kmsCoreDomain.decryptWithKmsKey({ kmsId: keyId });

    let plaintextBlob: Buffer;
    try {
      plaintextBlob = await decrypt({ cipherTextBlob: Buffer.from(ciphertext, "base64") });
    } catch (err) {
      if (!(err instanceof KmsCiphertextUndecryptableError)) throw err;
      // The ciphertext is caller input, so a blob no key version authenticates is a bad request, not a server fault.
      throw new BadRequestError({
        message:
          "The ciphertext could not be decrypted with this key. Check that it was encrypted with this key and has not been modified."
      });
    }

    return {
      plaintext: plaintextBlob.toString("base64"),
      projectId: key.projectId
    };
  };

  const bulkImportKeys = async (
    { projectId, keys }: TCmekBulkImportKeysDTO,
    actor: OrgServiceActor
  ): Promise<TCmekBulkImportKeysResult> => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Create, ProjectPermissionSub.Cmek);

    const hasPqcKeys = keys.some((entry) => isPqcKeyAlgorithm(entry.algorithm as string));
    let pqcLicensed = true;
    if (hasPqcKeys) {
      const plan = await licenseDomain.getPlan(actor.orgId);
      pqcLicensed = !!plan.kmsPqc;
    }

    const results = await Promise.allSettled(
      keys.map(async (entry): Promise<{ id: string; name: string }> => {
        if (isPqcKeyAlgorithm(entry.algorithm as string) && !pqcLicensed) {
          throw new BadRequestError({
            message:
              "Your license does not include PQC algorithms. Please upgrade to the Enterprise plan to use a PQC algorithm."
          });
        }
        const imported = await kmsCoreDomain.importKeyMaterial({
          key: Buffer.from(entry.keyMaterial, "base64"),
          algorithm: entry.algorithm,
          name: entry.name,
          isReserved: false,
          isExportable: entry.isExportable,
          hasDeleteProtection: entry.hasDeleteProtection,
          projectId,
          orgId: actor.orgId,
          keyUsage: entry.keyUsage
        });
        return { id: imported.id, name: imported.name };
      })
    );

    const importedKeys: { id: string; name: string }[] = [];
    const errors: { name: string; message: string }[] = [];

    results.forEach((result, i) => {
      const entry = keys[i];
      if (!entry) return;
      if (result.status === "fulfilled") {
        importedKeys.push(result.value);
      } else {
        const reason = result.reason as Error;
        let message = "Failed to import key";
        if (
          reason instanceof DatabaseError &&
          (reason.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation
        ) {
          message = `A key with the name "${entry.name}" already exists in this project`;
        } else if (reason instanceof BadRequestError) {
          message = reason.message;
        }
        errors.push({ name: entry.name, message });
      }
    });

    return { keys: importedKeys, errors, projectId };
  };

  return {
    createCmek,
    updateCmekById,
    rotateCmekById,
    deleteCmekById,
    listCmeksByProjectId,
    cmekEncrypt,
    cmekDecrypt,
    findCmekById,
    findCmekByName,
    cmekSign,
    cmekVerify,
    cmekGenerateMac,
    cmekVerifyMac,
    listSigningAlgorithms,
    getPublicKey,
    getPrivateKey,
    bulkGetPrivateKeys,
    bulkImportKeys
  };
};
