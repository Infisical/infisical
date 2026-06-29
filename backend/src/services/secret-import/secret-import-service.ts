import path from "node:path";

import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, TableName } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  hasSecretReadValueOrDescribePermission,
  throwIfMissingSecretReadValueOrDescribePermission
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ProjectEvents } from "@app/ee/services/project-events/project-events-types";
import { getReplicationFolderName } from "@app/ee/services/secret-replication/secret-replication-service";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { isCrossProjectEnabled } from "../project-grant/project-grant-fns";
import { TProjectGrantDALFactory } from "../project-grant/project-grant-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TSecretDALFactory } from "../secret/secret-dal";
import { decryptSecretRaw } from "../secret/secret-fns";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { recursivelyGetSecretPaths } from "../secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretImportDALFactory } from "./secret-import-dal";
import { fnSecretsFromImports, fnSecretsV2FromImports } from "./secret-import-fns";
import {
  TCreateSecretImportDTO,
  TDeleteSecretImportDTO,
  TGetCrossProjectImportSecretValueDTO,
  TGetSecretImportByIdDTO,
  TGetSecretImportsDTO,
  TGetSecretsFromImportDTO,
  TResyncSecretImportReplicationDTO,
  TUpdateSecretImportDTO
} from "./secret-import-types";

type TSecretImportServiceFactoryDep = {
  secretImportDAL: TSecretImportDALFactory;
  folderDAL: TSecretFolderDALFactory;
  secretDAL: Pick<TSecretDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findByFolderIds" | "invalidateSecretCacheByProjectId">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  projectDAL: Pick<TProjectDALFactory, "checkProjectUpgradeStatus" | "findById">;
  projectEnvDAL: TProjectEnvDALFactory;
  projectGrantDAL: Pick<TProjectGrantDALFactory, "findOne" | "find">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "replicateSecrets">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const ERR_SEC_IMP_NOT_FOUND = new BadRequestError({ message: "Secret import not found" });

export type TSecretImportServiceFactory = ReturnType<typeof secretImportServiceFactory>;

export const secretImportServiceFactory = ({
  secretImportDAL,
  projectEnvDAL,
  projectGrantDAL,
  orgDAL,
  permissionService,
  folderDAL,
  projectDAL,
  secretDAL,
  secretQueueService,
  licenseService,
  projectBotService,
  secretV2BridgeDAL,
  kmsService
}: TSecretImportServiceFactoryDep) => {
  const $annotateCrossProjectImports = async <
    T extends { id: string; importEnv: { id: string; projectId?: string | null }; importPath: string }
  >(
    imports: T[],
    projectId: string,
    actorOrgId: string
  ): Promise<(T & { isAccessRevoked: boolean })[]> => {
    const crossProject = imports.filter((imp) => imp.importEnv.projectId !== projectId);
    // TODO: Do we need isAccessRemoved?
    if (!crossProject.length) return imports.map((imp) => ({ ...imp, isAccessRevoked: false }));

    // If org-level toggle is disabled, strip cross-project imports entirely
    if (!(await isCrossProjectEnabled(actorOrgId, orgDAL))) {
      return imports
        .filter((imp) => imp.importEnv.projectId === projectId)
        // TODO: Do we need isAccessRemoved?
        .map((imp) => ({ ...imp, isAccessRevoked: false }));
    }

    const sourceFolders = await folderDAL.findByManySecretPath(
      crossProject.map((imp) => ({ envId: imp.importEnv.id, secretPath: imp.importPath }))
    );
    const grantedFolderIds = new Set<string>();
    const validSourceFolderIds = sourceFolders.filter(Boolean).map((f) => f!.id);
    if (validSourceFolderIds.length) {
      const grants = await projectGrantDAL.find({
        $in: { sourceFolderId: validSourceFolderIds },
        targetProjectId: projectId
      });
      grants.forEach((g) => grantedFolderIds.add(g.sourceFolderId));
    }

    const revokedIds = new Set(
      crossProject
        .filter((_, idx) => {
          const folder = sourceFolders[idx];
          return !folder || !grantedFolderIds.has(folder.id);
        })
        .map((imp) => imp.id)
    );

    return imports.map((imp) => ({ ...imp, isAccessRevoked: revokedIds.has(imp.id) }));
  };

  const createImport = async ({
    environment,
    data,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    isReplication,
    path: secretPath
  }: TCreateSecretImportDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    // check if user has permission to import into destination  path
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
    );

    const sourceProjectId = data.sourceProjectId ?? projectId;
    const isCrossProjectImport = sourceProjectId !== projectId;

    if (isCrossProjectImport) {
      if (!(await isCrossProjectEnabled(actorOrgId, orgDAL))) {
        throw new ForbiddenRequestError({ message: "Cross-project secret sharing is not enabled for this organization" });
      }

      const sourceProject = await projectDAL.findById(sourceProjectId);
      if (!sourceProject || sourceProject.orgId !== actorOrgId) {
        throw new NotFoundError({ message: "Source project not found" });
      }

      const importFolder = await folderDAL.findBySecretPath(sourceProjectId, data.environment, data.path);
      if (!importFolder) {
        throw new NotFoundError({
          message: `Folder with path '${data.path}' in environment '${data.environment}' not found in source project`
        });
      }

      const grant = await projectGrantDAL.findOne({ sourceFolderId: importFolder.id, targetProjectId: projectId });
      if (!grant) {
        throw new ForbiddenRequestError({
          message: "No project grant found allowing this cross-project import"
        });
      }
    } else {
      // check if user has permission to import from target path
      throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
        environment: data.environment,
        secretPath: data.path
      });
    }

    if (isReplication) {
      const plan = await licenseService.getPlan(actorOrgId);
      if (!plan.secretApproval) {
        throw new BadRequestError({
          message: "Failed to create secret replication due to plan restriction. Upgrade plan to create replication."
        });
      }
    }

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
      });

    const [importEnv] = await projectEnvDAL.findBySlugs(sourceProjectId, [data.environment]);
    if (!importEnv) {
      throw new NotFoundError({
        error: `Imported environment with slug '${data.environment}' in project with ID '${sourceProjectId}' not found`
      });
    }

    if (!isCrossProjectImport && environment === data.environment && secretPath === data.path) {
      throw new BadRequestError({ message: "Cyclic import not allowed" });
    }

    const sourceFolder = await folderDAL.findBySecretPath(sourceProjectId, data.environment, data.path);
    if (sourceFolder) {
      const existingImport = await secretImportDAL.findOne({
        folderId: sourceFolder.id,
        importEnv: folder.environment.id,
        importPath: secretPath
      });
      if (existingImport) throw new BadRequestError({ message: `Cyclic import not allowed` });
    }

    const secImport = await secretImportDAL.transaction(async (tx) => {
      const lastPos = await secretImportDAL.findLastImportPosition(folder.id, tx);
      const doc = await secretImportDAL.create(
        {
          folderId: folder.id,
          position: lastPos + 1,
          importEnv: importEnv.id,
          importPath: data.path,
          isReplication
        },
        tx
      );
      if (doc.isReplication) {
        await secretImportDAL.create(
          {
            folderId: folder.id,
            position: lastPos + 2,
            isReserved: true,
            importEnv: folder.environment.id,
            importPath: path.join(secretPath, getReplicationFolderName(doc.id))
          },
          tx
        );
      }
      return doc;
    });

    if (secImport.isReplication && sourceFolder) {
      await secretQueueService.replicateSecrets({
        secretPath: secImport.importPath,
        orgId: actorOrgId,
        projectId,
        environmentSlug: importEnv.slug,
        environmentName: importEnv.name,
        pickOnlyImportIds: [secImport.id],
        actorId,
        actor
      });
    } else {
      // TODO: check if I need to change anything here.
      await secretQueueService.syncSecrets({
        secretPath,
        orgId: actorOrgId,
        projectId,
        environmentSlug: environment,
        environmentName: folder.environment.name,
        actorId,
        actor,
        events: [
          {
            type: ProjectEvents.SecretImportMutation,
            projectId,
            secretPath,
            environment
          }
        ]
      });
    }

    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return { ...secImport, importEnv };
  };

  const updateImport = async ({
    path: secretPath,
    environment,
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    data,
    id
  }: TUpdateSecretImportDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
      });
    }

    const secImpDoc = await secretImportDAL.findOne({ folderId: folder.id, id });
    if (!secImpDoc) throw ERR_SEC_IMP_NOT_FOUND;

    const importedEnv = data.environment // this is get env information of new one or old one
      ? (await projectEnvDAL.findBySlugs(projectId, [data.environment]))?.[0]
      : await projectEnvDAL.findById(secImpDoc.importEnv);
    if (!importedEnv) {
      throw new NotFoundError({
        error: `Imported environment with slug '${data.environment}' in project with ID '${projectId}' not found`
      });
    }

    // check if user has permission to import from target path when source is changing
    if (data.environment || data.path) {
      const newSourcePath = data.path || secImpDoc.importPath;
      throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
        environment: importedEnv.slug,
        secretPath: newSourcePath
      });
    }

    const sourceFolder = await folderDAL.findBySecretPath(
      projectId,
      importedEnv.slug,
      data.path || secImpDoc.importPath
    );
    if (sourceFolder) {
      const existingImport = await secretImportDAL.findOne({
        folderId: sourceFolder.id,
        importEnv: folder.environment.id,
        importPath: secretPath
      });
      if (existingImport) throw new BadRequestError({ message: "Cyclic import not allowed" });
    }

    const updatedSecImport = await secretImportDAL.transaction(async (tx) => {
      const secImp = await secretImportDAL.findOne({ folderId: folder.id, id });
      if (!secImp) throw ERR_SEC_IMP_NOT_FOUND;

      let finalPosition = data.position;

      if (data.position) {
        if (secImp.isReplication) {
          const replicationFolderPath = path.join(secretPath, getReplicationFolderName(secImp.id));
          const reservedImport = await secretImportDAL.findOne({
            folderId: folder.id,
            importEnv: folder.environment.id,
            importPath: replicationFolderPath,
            isReserved: true
          });

          const pairIds = new Set([secImp.id, ...(reservedImport ? [reservedImport.id] : [])]);

          // Fetch all imports for this folder in position order.
          const allImports = await secretImportDAL.find({ folderId: folder.id }, tx);
          const otherImports = allImports
            .filter((imp) => !pairIds.has(imp.id))
            .sort((a, b) => Number(a.position) - Number(b.position));

          // Determine where in the compacted list to insert the pair.
          // data.position is the DB position of the displaced item in the original ordering.
          let insertIndex = otherImports.length;
          if (data.position > secImp.position) {
            // Moving forward: pair goes after the displaced item
            const idx = otherImports.findIndex((imp) => Number(imp.position) === data.position);
            if (idx !== -1) insertIndex = idx + 1;
          } else {
            // Moving backward: pair goes before the displaced item
            const idx = otherImports.findIndex((imp) => Number(imp.position) === data.position);
            if (idx !== -1) insertIndex = idx;
          }

          // Build new positions for all imports: other imports get sequential positions
          // with a 2-slot gap at insertIndex for the replication pair.
          const positionUpdates: { id: string; position: number }[] = [];
          let nextPos = 1;
          for (let i = 0; i < otherImports.length; i += 1) {
            if (i === insertIndex) nextPos += 2;
            positionUpdates.push({ id: otherImports[i].id, position: nextPos });
            nextPos += 1;
          }

          // The pair occupies the 2-slot gap at insertIndex + 1.
          finalPosition = insertIndex + 1;
          positionUpdates.push({ id: secImp.id, position: finalPosition });
          if (reservedImport) {
            positionUpdates.push({ id: reservedImport.id, position: finalPosition + 1 });
          }

          // Apply all position changes atomically to avoid unique constraint violations.
          await secretImportDAL.bulkUpdatePosition(positionUpdates, tx);
        } else {
          await secretImportDAL.updateAllPosition(folder.id, secImp.position, data.position, 1, tx);
        }
      } else if (secImp.isReplication) {
        const replicationFolderPath = path.join(secretPath, getReplicationFolderName(secImp.id));
        await secretImportDAL.update(
          {
            folderId: folder.id,
            importEnv: folder.environment.id,
            importPath: replicationFolderPath,
            isReserved: true
          },
          { position: undefined },
          tx
        );
      }

      const [doc] = await secretImportDAL.update(
        { id, folderId: folder.id },
        {
          position: finalPosition,
          importEnv: data?.environment ? importedEnv.id : undefined,
          importPath: data?.path
        },
        tx
      );
      return doc;
    });

    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return { ...updatedSecImport, importEnv: importedEnv };
  };

  const deleteImport = async ({
    path: secretPath,
    environment,
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    id
  }: TDeleteSecretImportDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
      });

    const secImport = await secretImportDAL.transaction(async (tx) => {
      const [doc] = await secretImportDAL.delete({ folderId: folder.id, id }, tx);
      if (!doc) throw new NotFoundError({ message: `Secret import with folder ID '${id}' not found` });
      if (doc.isReplication) {
        const replicationFolderPath = path.join(secretPath, getReplicationFolderName(doc.id));
        const replicatedFolder = await folderDAL.findBySecretPath(projectId, environment, replicationFolderPath, tx);
        if (replicatedFolder) {
          await secretImportDAL.delete(
            {
              folderId: folder.id,
              importEnv: folder.environment.id,
              importPath: replicationFolderPath,
              isReserved: true
            },
            tx
          );
          await folderDAL.deleteById(replicatedFolder.id, tx);
        }
        await secretImportDAL.updateAllPosition(folder.id, doc.position, -1, 2, tx);
      } else {
        await secretImportDAL.updateAllPosition(folder.id, doc.position, -1, 1, tx);
      }

      const importEnv = await projectEnvDAL.findById(doc.importEnv);
      if (!importEnv) {
        throw new NotFoundError({
          error: `Imported environment with ID '${doc.importEnv}' in project with ID '${projectId}' not found`
        });
      }
      return { ...doc, importEnv };
    });

    await secretQueueService.syncSecrets({
      secretPath,
      orgId: actorOrgId,
      projectId,
      environmentSlug: environment,
      environmentName: folder.environment.name,
      actor,
      actorId,
      events: [
        {
          type: ProjectEvents.SecretImportMutation,
          projectId,
          secretPath,
          environment
        }
      ]
    });

    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return secImport;
  };

  const resyncSecretImportReplication = async ({
    environment,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    path: secretPath,
    id: secretImportDocId
  }: TResyncSecretImportReplicationDTO) => {
    const { permission, memberships } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    // check if user has permission to import into destination  path
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message: "Failed to create secret replication due to plan restriction. Upgrade plan to create replication."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
      });
    }

    const [secretImportDoc] = await secretImportDAL.find({
      folderId: folder.id,
      [`${TableName.SecretImport}.id` as "id"]: secretImportDocId
    });
    if (!secretImportDoc)
      throw new NotFoundError({ message: `Secret import with ID '${secretImportDocId}' not found` });

    if (!secretImportDoc.isReplication) throw new BadRequestError({ message: "Import is not in replication mode" });

    // check if user has permission to import from target path
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
      environment: secretImportDoc.importEnv.slug,
      secretPath: secretImportDoc.importPath
    });

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const sourceFolder = await folderDAL.findBySecretPath(
      projectId,
      secretImportDoc.importEnv.slug,
      secretImportDoc.importPath
    );

    if (memberships?.length && sourceFolder) {
      await secretQueueService.replicateSecrets({
        orgId: actorOrgId,
        secretPath: secretImportDoc.importPath,
        projectId,
        environmentSlug: secretImportDoc.importEnv.slug,
        environmentName: secretImportDoc.importEnv.name,
        pickOnlyImportIds: [secretImportDoc.id],
        actorId,
        actor
      });
    }

    return { message: "replication started" };
  };

  const getProjectImportCount = async ({
    path: secretPath,
    environment,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    search
  }: TGetSecretImportsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
      });

    const allImports = await secretImportDAL.find({ folderId: folder.id, search });
    const accessible = await $annotateCrossProjectImports(allImports, projectId, actorOrgId);
    return accessible.length;
  };

  const getProjectImportMultiEnvCount = async ({
    path: secretPath,
    environments,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    search
  }: Omit<TGetSecretImportsDTO, "environment"> & { environments: string[] }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    const filteredEnvironments = [];
    for (const environment of environments) {
      if (
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
        )
      ) {
        filteredEnvironments.push(environment);
      }
    }
    if (filteredEnvironments.length === 0) {
      return 0;
    }

    for (const environment of filteredEnvironments) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
      );
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, secretPath);
    if (!folders?.length)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' not found on environments with slugs '${environments.join(", ")}'`
      });

    const importArrays = await Promise.all(
      folders.map(async (folder) => {
        const imports = await secretImportDAL.find({ folderId: folder.id, search });
        return $annotateCrossProjectImports(imports, projectId, actorOrgId);
      })
    );

    const seen = new Set<string>();
    for (const folderImports of importArrays) {
      for (const imp of folderImports) {
        seen.add(`${imp.importPath}:${imp.importEnv.id}`);
      }
    }
    return seen.size;
  };

  const getImports = async ({
    path: secretPath,
    environment,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    search,
    limit,
    offset
  }: TGetSecretImportsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
      });

    const secImports = await secretImportDAL.find({ folderId: folder.id, search, limit, offset });
    return $annotateCrossProjectImports(secImports, projectId, actorOrgId);
  };

  const getImportById = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    id: importId
  }: TGetSecretImportByIdDTO) => {
    const importDoc = await secretImportDAL.findById(importId);

    if (!importDoc) {
      throw new NotFoundError({ message: `Secret import with ID '${importId}' not found` });
    }

    // the folder to import into
    const folder = await folderDAL.findById(importDoc.folderId);

    if (!folder) throw new NotFoundError({ message: `Secret import folder with ID '${importDoc.folderId}' not found` });

    // the folder to import into, with path
    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(folder.projectId, [folder.id]);

    if (!folderWithPath) {
      throw new NotFoundError({
        message: `Folder with ID '${folder.id}' in project with ID ${folder.projectId} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: folder.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.SecretImports, {
        environment: folder.environment.envSlug,
        secretPath: folderWithPath.path
      })
    );

    const importIntoEnv = await projectEnvDAL.findOne({
      projectId: folder.projectId,
      slug: folder.environment.envSlug
    });

    if (!importIntoEnv) {
      throw new NotFoundError({
        message: `Environment with slug '${folder.environment.envSlug}' in project with ID ${folder.projectId} not found`
      });
    }

    return {
      ...importDoc,
      projectId: folder.projectId,
      secretPath: folderWithPath.path,
      environment: {
        id: importIntoEnv.id,
        slug: importIntoEnv.slug,
        name: importIntoEnv.name
      }
    };
  };

  const getSecretsFromImports = async ({
    path: secretPath,
    environment,
    projectId,
    actor,
    actorAuthMethod,
    actorId,
    actorOrgId
  }: TGetSecretsFromImportDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
    );
    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return [];
    // this will already order by position
    // so anything based on this order will also be in right position
    const secretImports = (
      await $annotateCrossProjectImports(
        await secretImportDAL.find({ folderId: folder.id, isReplication: false }),
        projectId,
        actorOrgId
      )
    ).filter((imp) => !imp.isAccessRevoked);
    const allowedImports = secretImports.filter((el) =>
      hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
        environment: el.importEnv.slug,
        secretPath: el.importPath
      })
    );

    return fnSecretsFromImports({ allowedImports, folderDAL, secretDAL, secretImportDAL });
  };

  const getRawSecretsFromImports = async ({
    path: secretPath,
    environment,
    projectId,
    actor,
    actorAuthMethod,
    actorId,
    actorOrgId
  }: TGetSecretsFromImportDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
    );
    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return [];
    // this will already order by position
    // so anything based on this order will also be in right position
    const secretImports = (
      await $annotateCrossProjectImports(
        await secretImportDAL.find({ folderId: folder.id, isReplication: false }),
        projectId,
        actorOrgId
      )
    ).filter((imp) => !imp.isAccessRevoked);

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      const importedSecrets = await fnSecretsV2FromImports({
        secretImports,
        folderDAL,
        viewSecretValue: true,
        secretDAL: secretV2BridgeDAL,
        secretImportDAL,
        decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : ""),
        hasSecretAccess: (expandEnvironment, expandSecretPath, expandSecretKey, expandSecretTags) =>
          hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
            environment: expandEnvironment,
            secretPath: expandSecretPath,
            secretName: expandSecretKey,
            secretTags: expandSecretTags
          }),
        projectId,
        projectGrantDAL,
        actorOrgId,
        orgDAL,
        kmsService
      });

      return importedSecrets;
    }

    if (!botKey)
      throw new NotFoundError({
        message: `Project bot not found for project with ID '${projectId}'. Please upgrade your project.`,
        name: "bot_not_found_error"
      });

    const allowedImports = secretImports.filter((el) =>
      hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
        environment: el.importEnv.slug,
        secretPath: el.importPath
      })
    );
    const importedSecrets = await fnSecretsFromImports({
      allowedImports,
      folderDAL,
      secretDAL,
      secretImportDAL
    });
    return importedSecrets.map((el) => ({
      ...el,
      secrets: el.secrets.map((encryptedSecret) =>
        decryptSecretRaw(
          { ...encryptedSecret, workspace: projectId, environment, secretPath, secretValueHidden: false },
          botKey
        )
      )
    }));
  };

  const getImportsMultiEnv = async ({
    path: secretPath,
    environments,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    search,
    limit,
    offset
  }: Omit<TGetSecretImportsDTO, "environment"> & { environments: string[] }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    const filteredEnvironments = [];
    for (const environment of environments) {
      if (
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
        )
      ) {
        filteredEnvironments.push(environment);
      }
    }
    if (filteredEnvironments.length === 0) {
      return [];
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, filteredEnvironments, secretPath);
    if (!folders?.length)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' not found on environments with slugs '${environments.join(", ")}'`
      });

    const secImportsArrays = await Promise.all(
      folders.map(async (folder) => {
        const imports = await secretImportDAL.find({ folderId: folder.id, search, limit, offset });
        const annotated = await $annotateCrossProjectImports(imports, projectId, actorOrgId);
        return annotated.map((importItem) => ({
          ...importItem,
          environment: folder.environment.slug
        }));
      })
    );
    return secImportsArrays.flat();
  };

  const getFolderIsImportedBy = async ({
    path: secretPath,
    environment,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    secrets
  }: TGetSecretImportsDTO & {
    secrets: { secretKey: string; secretValue: string; id: string }[] | undefined;
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    if (
      permission.cannot(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
      )
    ) {
      return [];
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return [];

    const project = await projectDAL.findById(projectId);
    const importedBy = await secretImportDAL.getFolderIsImportedBy(
      secretPath,
      folder.envId,
      environment,
      projectId,
      project.slug
    );

    const sameProjItems = importedBy.filter((el) => !el.projectSlug);
    const crossProjItems = importedBy.filter((el) => el.projectSlug);

    const deepPaths: { path: string; folderId: string }[] = [];

    await Promise.all([
      ...sameProjItems.map(async (el) => {
        const envDeepPaths = await recursivelyGetSecretPaths({
          folderDAL,
          projectEnvDAL,
          projectId,
          environment: el.envSlug,
          currentPath: "/"
        });
        deepPaths.push(...envDeepPaths);
      }),
      ...crossProjItems.map(async (el) => {
        const envDeepPaths = await recursivelyGetSecretPaths({
          folderDAL,
          projectEnvDAL,
          projectId: el.projectId!,
          environment: el.envSlug,
          currentPath: "/"
        });
        deepPaths.push(...envDeepPaths);
      })
    ]);

    const result = [
      ...sameProjItems.map((el) => ({
        environment: {
          name: el.envName,
          slug: el.envSlug
        },
        folders: el.folders.map((folderItem) => ({
          folderId: folderItem.folderId,
          isImported: folderItem.folderImported,
          secrets: folderItem.secrets,
          name: deepPaths.find((p) => p.folderId === folderItem.folderId)?.path || `...${folderItem.folderName}`
        }))
      })),
      ...crossProjItems.map((el) => ({
        environment: {
          name: el.envName,
          slug: el.envSlug
        },
        project: {
          name: el.projectName!,
          slug: el.projectSlug!,
          id: el.projectId!
        },
        folders: el.folders.map((folderItem) => ({
          folderId: folderItem.folderId,
          isImported: folderItem.folderImported,
          secrets: folderItem.secrets,
          name: deepPaths.find((p) => p.folderId === folderItem.folderId)?.path || `...${folderItem.folderName}`
        }))
      }))
    ];

    // Special case for same folder references as these do not have an entry on the references table
    const locallyReferenced =
      secrets
        ?.filter((secret) => {
          return secrets.some(
            (otherSecret) =>
              otherSecret.secretKey !== secret.secretKey && secret.secretValue.includes(`\${${otherSecret.secretKey}}`)
          );
        })
        .flatMap((secret) => {
          return secrets
            .filter(
              (otherSecret) =>
                otherSecret.secretKey !== secret.secretKey &&
                secret.secretValue.includes(`\${${otherSecret.secretKey}}`)
            )
            .map((otherSecret) => ({
              secretId: secret.secretKey,
              referencedSecretKey: otherSecret.secretKey,
              referencedSecretEnv: environment
            }));
        }) || [];
    if (locallyReferenced.length > 0) {
      const existingEnvIndex = result.findIndex((item) => item.environment.slug === environment);

      if (existingEnvIndex >= 0) {
        const existingFolderIndex = result[existingEnvIndex].folders.findIndex(
          (folderItem) => folderItem.name === secretPath
        );

        if (existingFolderIndex >= 0) {
          if (!result[existingEnvIndex].folders[existingFolderIndex].secrets) {
            result[existingEnvIndex].folders[existingFolderIndex].secrets = [];
          }

          const existingSecrets = result[existingEnvIndex].folders[existingFolderIndex].secrets || [];
          locallyReferenced.forEach((ref) => {
            if (
              !existingSecrets.some(
                (s) => s.secretId === ref.secretId && s.referencedSecretKey === ref.referencedSecretKey
              )
            ) {
              existingSecrets.push(ref);
            }
          });
        } else {
          result[existingEnvIndex].folders.push({
            folderId: folder.id,
            isImported: false,
            secrets: locallyReferenced,
            name: secretPath
          });
        }
      } else {
        result.push({
          environment: {
            slug: environment,
            name: environment
          },
          folders: [
            {
              folderId: folder.id,
              isImported: false,
              secrets: locallyReferenced,
              name: secretPath
            }
          ]
        });
      }
    }

    return result;
  };

  const getCrossProjectImportSecretValue = async ({
    projectId,
    sourceProjectId,
    environment,
    secretPath,
    secretName,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TGetCrossProjectImportSecretValueDTO) => {
    if (!(await isCrossProjectEnabled(actorOrgId, orgDAL))) {
      throw new ForbiddenRequestError({ message: "Cross-project secret sharing is not enabled for this organization" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
      environment,
      secretPath,
      secretName
    });

    const sourceProject = await projectDAL.findById(sourceProjectId);
    if (!sourceProject || sourceProject.orgId !== actorOrgId)
      throw new NotFoundError({ message: "Source project not found" });

    const sourceFolder = await folderDAL.findBySecretPath(sourceProjectId, environment, secretPath);
    if (!sourceFolder)
      throw new NotFoundError({
        message: `Folder not found at path '${secretPath}' in environment '${environment}' of source project`
      });

    const grant = await projectGrantDAL.findOne({
      sourceFolderId: sourceFolder.id,
      targetProjectId: projectId
    });
    if (!grant)
      throw new ForbiddenRequestError({ message: "No cross-project grant found authorizing this import" });

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(sourceProjectId);
    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({ message: "Source project has not been upgraded to the latest version" });

    const { decryptor: sourceDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: sourceProjectId
    });

    const secrets = await secretV2BridgeDAL.find(
      { folderId: sourceFolder.id, [`${TableName.SecretV2}.key` as "key"]: secretName },
      { limit: 1 }
    );
    if (!secrets.length)
      throw new NotFoundError({ message: `Secret '${secretName}' not found in source project` });

    const secretValue = secrets[0].encryptedValue
      ? sourceDecryptor({ cipherTextBlob: secrets[0].encryptedValue }).toString()
      : "";

    return { value: secretValue };
  };

  return {
    createImport,
    updateImport,
    deleteImport,
    getImports,
    getImportById,
    getSecretsFromImports,
    getRawSecretsFromImports,
    resyncSecretImportReplication,
    getProjectImportCount,
    fnSecretsFromImports,
    getProjectImportMultiEnvCount,
    getImportsMultiEnv,
    getFolderIsImportedBy,
    getCrossProjectImportSecretValue
  };
};
