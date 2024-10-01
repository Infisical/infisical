import { OrgMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ForbiddenRequestError } from "@app/lib/errors";

import { TOrgServiceFactory } from "../org/org-service";
import { TProjectServiceFactory } from "../project/project-service";
import { TProjectEnvServiceFactory } from "../project-env/project-env-service";
import { TSecretServiceFactory } from "../secret/secret-service";
import { decryptEnvKeyDataFn, importDataIntoInfisicalFn, parseEnvKeyDataFn } from "./external-migration-fns";
import { TImportEnvKeyDataCreate } from "./external-migration-types";

type TExternalMigrationServiceFactoryDep = {
  projectService: TProjectServiceFactory;
  orgService: TOrgServiceFactory;
  projectEnvService: TProjectEnvServiceFactory;
  secretService: TSecretServiceFactory;
  permissionService: TPermissionServiceFactory;
};

export type TExternalMigrationServiceFactory = ReturnType<typeof externalMigrationServiceFactory>;

export const externalMigrationServiceFactory = ({
  projectService,
  orgService,
  projectEnvService,
  permissionService,
  secretService
}: TExternalMigrationServiceFactoryDep) => {
  const importEnvKeyData = async ({
    decryptionKey,
    encryptedJson,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TImportEnvKeyDataCreate) => {
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

    const json = await decryptEnvKeyDataFn(decryptionKey, encryptedJson);
    const envKeyData = await parseEnvKeyDataFn(json);
    const response = await importDataIntoInfisicalFn({
      input: { data: envKeyData, actor, actorId, actorOrgId, actorAuthMethod },
      projectService,
      orgService,
      projectEnvService,
      secretService
    });
    return response;
  };

  return {
    importEnvKeyData
  };
};
