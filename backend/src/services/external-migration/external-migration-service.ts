import { OrgMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";

import { TUserDALFactory } from "../user/user-dal";
import { decryptEnvKeyDataFn, parseEnvKeyDataFn } from "./external-migration-fns";
import { TExternalMigrationQueueFactory } from "./external-migration-queue";
import { TImportEnvKeyDataCreate } from "./external-migration-types";

type TExternalMigrationServiceFactoryDep = {
  permissionService: TPermissionServiceFactory;
  externalMigrationQueue: TExternalMigrationQueueFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export type TExternalMigrationServiceFactory = ReturnType<typeof externalMigrationServiceFactory>;

export const externalMigrationServiceFactory = ({
  permissionService,
  externalMigrationQueue,
  userDAL
}: TExternalMigrationServiceFactoryDep) => {
  const importEnvKeyData = async ({
    decryptionKey,
    encryptedJson,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TImportEnvKeyDataCreate) => {
    if (crypto.isFipsModeEnabled()) {
      throw new BadRequestError({ message: "EnvKey migration is not supported when running in FIPS mode." });
    }

    const { membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (membership.role !== OrgMembershipRole.Admin) {
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
      actorEmail: user.email!,
      data: encrypted
    });
  };

  return {
    importEnvKeyData
  };
};
