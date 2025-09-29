import { OrgMembershipRole } from "@app/db/schemas";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";

import { TUserDALFactory } from "../user/user-dal";
import {
  decryptEnvKeyDataFn,
  importVaultDataFn,
  parseEnvKeyDataFn,
  vaultMigrationTransformMappings
} from "./external-migration-fns";
import { TExternalMigrationQueueFactory } from "./external-migration-queue";
import {
  ExternalMigrationProviders,
  ExternalPlatforms,
  THasCustomVaultMigrationDTO,
  TImportEnvKeyDataDTO,
  TImportVaultDataDTO
} from "./external-migration-types";

type TExternalMigrationServiceFactoryDep = {
  permissionService: TPermissionServiceFactory;
  externalMigrationQueue: TExternalMigrationQueueFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
};

export type TExternalMigrationServiceFactory = ReturnType<typeof externalMigrationServiceFactory>;

export const externalMigrationServiceFactory = ({
  permissionService,
  externalMigrationQueue,
  userDAL,
  gatewayService
}: TExternalMigrationServiceFactoryDep) => {
  const importEnvKeyData = async ({
    decryptionKey,
    encryptedJson,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TImportEnvKeyDataDTO) => {
    if (crypto.isFipsModeEnabled()) {
      throw new BadRequestError({ message: "EnvKey migration is not supported when running in FIPS mode." });
    }

    const { hasRole } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can import data" });
    }

    const user = await userDAL.findById(actorId);
    const json = await decryptEnvKeyDataFn(decryptionKey, encryptedJson);
    const envKeyData = await parseEnvKeyDataFn(json);

    const stringifiedJson = JSON.stringify({
      data: envKeyData,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod
    });

    const encrypted = crypto.encryption().symmetric().encryptWithRootEncryptionKey(stringifiedJson);

    await externalMigrationQueue.startImport({
      actorId: user.id,
      orgId: actorOrgId,
      actorEmail: user.email!,
      importType: ExternalPlatforms.EnvKey,
      data: {
        ...encrypted
      }
    });
  };

  const importVaultData = async ({
    vaultAccessToken,
    vaultNamespace,
    mappingType,
    vaultUrl,
    gatewayId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TImportVaultDataDTO) => {
    const { hasRole } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    if (hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can import data" });
    }

    const user = await userDAL.findById(actorId);

    const vaultData = await importVaultDataFn(
      {
        vaultAccessToken,
        vaultNamespace,
        vaultUrl,
        mappingType,
        gatewayId,
        orgId: actorOrgId
      },
      {
        gatewayService
      }
    );

    const stringifiedJson = JSON.stringify({
      data: vaultData,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod
    });

    const encrypted = crypto.encryption().symmetric().encryptWithRootEncryptionKey(stringifiedJson);

    await externalMigrationQueue.startImport({
      actorId: user.id,
      orgId: actorOrgId,
      actorEmail: user.email!,
      importType: ExternalPlatforms.Vault,
      data: {
        ...encrypted
      }
    });
  };

  const hasCustomVaultMigration = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    provider
  }: THasCustomVaultMigrationDTO) => {
    const { hasRole } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    if (hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only admins can check custom migration status" });
    }

    if (provider !== ExternalMigrationProviders.Vault) {
      throw new BadRequestError({
        message: "Invalid provider. Vault is the only supported provider for custom migrations."
      });
    }

    return actorOrgId in vaultMigrationTransformMappings;
  };

  return {
    importEnvKeyData,
    importVaultData,
    hasCustomVaultMigration
  };
};
