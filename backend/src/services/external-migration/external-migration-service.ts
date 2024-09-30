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
};

export type TExternalMigrationServiceFactory = ReturnType<typeof externalMigrationServiceFactory>;

export const externalMigrationServiceFactory = ({
  projectService,
  orgService,
  projectEnvService,
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
