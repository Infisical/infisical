import slugify from "@sindresorhus/slugify";

import { SecretFolderRole } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCacheFingerprint } from "@app/lib/cache/with-cache";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { ActorType } from "../auth/auth-type";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { buildFolderAccess, reviveFolderAccess, splitFolderAccess } from "./folder-access-roles-fns";
import { TFolderPermissionDALFactory } from "./folder-permission-dal";
import {
  assertFullAccessIsPermanent,
  assertGrantTargetEligible,
  assertManageFolderAccess,
  assertManageFolderSubtree,
  assertReadActorGrantsAccess,
  assertRecursiveFolderIsRoot,
  computeTemporaryFields,
  getFolderAccessPermission,
  resolveFolder,
  targetActorField,
  targetLabel,
  toFolderGrant
} from "./folder-permission-fns";
import {
  TCachedFolderAccess,
  TCreateFolderGrantDTO,
  TDeleteFolderGrantDTO,
  TFolderAccessEntry,
  TFolderAccessMembership,
  TFolderGrant,
  TListActorFolderGrantsDTO,
  TListFolderAccessActorsDTO,
  TProjectMember,
  TProjectMemberActor,
  TProjectMemberIdentity,
  TProjectMemberUser,
  TResolvedFolder,
  TUpdateFolderGrantDTO
} from "./folder-permission-types";

type TFolderPermissionServiceFactoryDep = {
  additionalPrivilegeDAL: Pick<
    TAdditionalPrivilegeDALFactory,
    "findOne" | "findOneForUpdate" | "find" | "create" | "updateById" | "deleteById" | "transaction"
  >;
  secretFolderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "invalidateProjectFolderPermissionCache">;
  folderPermissionDAL: Pick<
    TFolderPermissionDALFactory,
    | "findProjectUsersWithRoles"
    | "findProjectIdentitiesWithRoles"
    | "getFolderAccessFingerprint"
    | "hasProjectAccess"
    | "isProjectAdmin"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "getItemPrimary" | "setItemWithExpiry">;
};

type TFolderActorType = ActorType.USER | ActorType.IDENTITY;

type TProjectScope = { projectId: string; orgId: string };

type TFolderMemberPage = { limit: number; offset: number; search?: string };

type TFolderAccessItem<TActor extends TProjectMemberActor> = {
  actor: TActor;
  membership: TFolderAccessMembership;
  folderRBACAccess: TFolderGrant | null;
  inheritedFolderRBACAccess: TFolderGrant | null;
};

export type TFolderPermissionServiceFactory = ReturnType<typeof folderPermissionServiceFactory>;

export const folderPermissionServiceFactory = ({
  additionalPrivilegeDAL,
  secretFolderDAL,
  permissionService,
  folderPermissionDAL,
  licenseService,
  keyStore
}: TFolderPermissionServiceFactoryDep) => {
  const assertFolderRbacLicensed = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsFolderRbac) {
      throw new BadRequestError({
        message: "Failed to access folder access controls due to plan restriction. Upgrade your Infisical plan."
      });
    }
  };

  const createFolderGrant = async (dto: TCreateFolderGrantDTO) => {
    const { projectId, environmentSlug, secretPath, target } = dto;
    assertFullAccessIsPermanent(dto.role, Boolean(dto.type?.isTemporary));

    await assertFolderRbacLicensed(dto.permission.orgId);
    const callerPermission = await getFolderAccessPermission(dto.permission, projectId, permissionService);
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    assertManageFolderAccess(callerPermission, folder);
    if (dto.isPermissionRecursive) {
      assertRecursiveFolderIsRoot(folder);
      assertManageFolderSubtree(callerPermission, folder);
    }
    await assertGrantTargetEligible(dto.permission.orgId, projectId, target, folderPermissionDAL);

    const actorField = targetActorField(target);
    const alreadyExistsError = () =>
      new BadRequestError({
        message: `${targetLabel(target)} with ID '${target.actorId}' already has folder access on this folder with the '${dto.role}' role or another one. Update the existing access instead of creating a new one.`
      });

    try {
      const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
        const existing = await additionalPrivilegeDAL.findOne(
          { projectId, folderId: folder.id, [actorField]: target.actorId },
          tx
        );
        if (existing) throw alreadyExistsError();

        const doc = await additionalPrivilegeDAL.create(
          {
            name: slugify(alphaNumericNanoId(8)),
            projectId,
            folderId: folder.id,
            role: dto.role,
            [actorField]: target.actorId,
            appliesToSubfolders: Boolean(dto.isPermissionRecursive),
            ...computeTemporaryFields(dto.type)
          },
          tx
        );
        await permissionService.invalidateProjectFolderPermissionCache(projectId, tx);
        return doc;
      });

      return { folderAccess: toFolderGrant(grant, projectId, folder) };
    } catch (error) {
      const dbError = error instanceof DatabaseError ? (error.error as { code?: string }) : null;
      if (dbError?.code === DatabaseErrorCode.UniqueViolation) throw alreadyExistsError();
      throw error;
    }
  };

  const updateFolderGrant = async (dto: TUpdateFolderGrantDTO) => {
    const { projectId, environmentSlug, secretPath, target } = dto;
    await assertFolderRbacLicensed(dto.permission.orgId);
    const callerPermission = await getFolderAccessPermission(dto.permission, projectId, permissionService);
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    assertManageFolderAccess(callerPermission, folder);
    if (dto.isPermissionRecursive) assertRecursiveFolderIsRoot(folder);
    await assertGrantTargetEligible(dto.permission.orgId, projectId, target, folderPermissionDAL);

    const actorField = targetActorField(target);
    const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
      const existing = await additionalPrivilegeDAL.findOneForUpdate(
        { projectId, folderId: folder.id, [actorField]: target.actorId },
        tx
      );
      if (!existing) {
        throw new NotFoundError({
          message: `No folder access found for ${targetLabel(target).toLowerCase()} with ID '${target.actorId}' on the folder at path '${folder.path}' in environment with slug '${folder.environmentSlug}'. Create one first.`
        });
      }

      assertFullAccessIsPermanent(
        (dto.role ?? existing.role) as SecretFolderRole,
        dto.type === undefined ? existing.isTemporary : dto.type.isTemporary
      );
      if (existing.appliesToSubfolders || dto.isPermissionRecursive)
        assertManageFolderSubtree(callerPermission, folder);

      const doc = await additionalPrivilegeDAL.updateById(
        existing.id,
        {
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.type === undefined ? {} : computeTemporaryFields(dto.type)),
          ...(dto.isPermissionRecursive === undefined ? {} : { appliesToSubfolders: dto.isPermissionRecursive })
        },
        tx
      );
      await permissionService.invalidateProjectFolderPermissionCache(projectId, tx);
      return doc;
    });

    return { folderAccess: toFolderGrant(grant, projectId, folder) };
  };

  const deleteFolderGrant = async (dto: TDeleteFolderGrantDTO) => {
    const { projectId, environmentSlug, secretPath, target } = dto;
    await assertFolderRbacLicensed(dto.permission.orgId);
    const callerPermission = await getFolderAccessPermission(dto.permission, projectId, permissionService);
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    assertManageFolderAccess(callerPermission, folder);
    // no membership check on revoke: removing access from an actor that already left the project
    // must keep working

    const actorField = targetActorField(target);
    const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
      const existing = await additionalPrivilegeDAL.findOneForUpdate(
        { projectId, folderId: folder.id, [actorField]: target.actorId },
        tx
      );
      if (!existing) {
        throw new NotFoundError({
          message: `No folder access found for ${targetLabel(target).toLowerCase()} with ID '${target.actorId}' on the folder at path '${folder.path}' in environment with slug '${folder.environmentSlug}'`
        });
      }
      if (existing.appliesToSubfolders) assertManageFolderSubtree(callerPermission, folder, "remove");

      const doc = await additionalPrivilegeDAL.deleteById(existing.id, tx);
      await permissionService.invalidateProjectFolderPermissionCache(projectId, tx);
      return doc;
    });

    return { folderAccess: toFolderGrant(grant, projectId, folder) };
  };

  const $getFolderAccess = async <TActor extends TProjectMemberActor>(
    {
      projectId,
      orgId,
      folder,
      actorType,
      page
    }: TProjectScope & { folder: TResolvedFolder; actorType: TFolderActorType; page: TFolderMemberPage },
    fetchMembers: () => Promise<{ data: TProjectMember<TActor>[]; totalCount: number }>
  ) => {
    // if we don't take the search in consideration, it can create a cache key that does not have anything.
    const pageKey = `${page.offset}:${page.limit}:${page.search ?? ""}`;
    const dataFetcher = async () => {
      const { data, totalCount } = await fetchMembers();
      return buildFolderAccess(data, folder, totalCount);
    };

    let rosterVersion: string;
    try {
      rosterVersion =
        (await keyStore.getItemPrimary(KeyStorePrefixes.ProjectFolderAccessRosterVersion(projectId))) ?? "0";
    } catch (err) {
      logger.warn(
        { err, projectId },
        `Failed to read the folder access roster version, skipping the roster cache. projectId: ${projectId}`
      );
      return dataFetcher();
    }

    return withCacheFingerprint<TCachedFolderAccess<TActor>>({
      keyStore,
      dataKey: KeyStorePrefixes.ProjectFolderAccessData(projectId, folder.id, actorType, pageKey),
      markerKey: KeyStorePrefixes.ProjectFolderAccessMarker(projectId, rosterVersion, folder.id, actorType, pageKey),
      markerTtlSeconds: KeyStoreTtls.ProjectFolderAccessMarkerTtlSeconds,
      dataTtlSeconds: KeyStoreTtls.ProjectFolderAccessDataTtlSeconds,
      // the key is by folder id but the granting roles are evaluated against the folder's path, and a
      // rename or move changes neither the id nor anything the DB fingerprint tracks
      fingerprintFetcher: async () => {
        const fingerprint = await folderPermissionDAL.getFolderAccessFingerprint({ projectId, orgId, actorType });
        return `${fingerprint}|${folder.environmentSlug}|${folder.path}`;
      },
      dataFetcher,
      reviver: reviveFolderAccess
    });
  };

  const $resolveRootFolder = async (folder: TResolvedFolder): Promise<TResolvedFolder> => {
    const root = await secretFolderDAL.findOne({ envId: folder.envId, parentId: null });
    if (!root) {
      throw new NotFoundError({
        message: `Root folder not found in environment with slug '${folder.environmentSlug}'`
      });
    }
    return { id: root.id, path: "/", environmentSlug: folder.environmentSlug, envId: folder.envId };
  };

  const $listFolderAccessActors = async <TActor extends TProjectMemberActor>(
    dto: TListFolderAccessActorsDTO,
    {
      actorType,
      fetchMembers,
      actorIdOf
    }: {
      actorType: TFolderActorType;
      fetchMembers: (
        scope: TProjectScope,
        page: TFolderMemberPage
      ) => Promise<{ data: TProjectMember<TActor>[]; totalCount: number }>;
      actorIdOf: (actor: TActor) => string;
    }
  ) => {
    const { projectId, environmentSlug, secretPath, limit, offset, search } = dto;
    const { orgId } = dto.permission;
    await assertFolderRbacLicensed(orgId);
    const callerPermission = await getFolderAccessPermission(dto.permission, projectId, permissionService);
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    assertManageFolderAccess(callerPermission, folder);

    const page = { limit, offset, search };
    const actorField = actorType === ActorType.USER ? "actorUserId" : "actorIdentityId";
    const rootFolder = folder.path === "/" ? folder : await $resolveRootFolder(folder);
    // grants stay out of the cached folder access so a grant or revoke is visible on the very next request
    const [folderAccess, grants] = await Promise.all([
      $getFolderAccess<TActor>({ projectId, orgId, folder, actorType, page }, () =>
        fetchMembers({ projectId, orgId }, page)
      ),
      additionalPrivilegeDAL.find({
        projectId,
        $in: { folderId: [...new Set([folder.id, rootFolder.id])] },
        $notNull: [actorField]
      })
    ]);
    const byActorId = (rows: typeof grants) =>
      new Map(rows.filter((grant) => grant.role).map((grant) => [grant[actorField] as string, grant]));
    const grantByActorId = byActorId(grants.filter((grant) => grant.folderId === folder.id));
    const inheritedGrantByActorId = byActorId(
      grants.filter((grant) => grant.folderId !== folder.id && grant.appliesToSubfolders)
    );

    // the page is one slice of the project roster; the split only says which of the two lists each of
    // its actors belongs to, so the totals are not per-list
    const { withAccess, withoutAccess } = splitFolderAccess({
      folderAccess,
      grantByActorId,
      inheritedGrantByActorId,
      actorIdOf,
      now: new Date()
    });

    const toItem = ({
      actor,
      membership,
      grant,
      inheritedGrant
    }: TFolderAccessEntry<TActor>): TFolderAccessItem<TActor> => ({
      actor,
      membership,
      folderRBACAccess: grant ? toFolderGrant(grant, projectId, folder) : null,
      inheritedFolderRBACAccess: inheritedGrant ? toFolderGrant(inheritedGrant, projectId, rootFolder) : null
    });

    return {
      withAccess: withAccess.map(toItem),
      withoutAccess: withoutAccess.map(toItem),
      totalCount: folderAccess.totalCount
    };
  };

  const listFolderAccessUsers = async (dto: TListFolderAccessActorsDTO) => {
    const toUser = ({
      actor,
      membership,
      folderRBACAccess,
      inheritedFolderRBACAccess
    }: TFolderAccessItem<TProjectMemberUser>) => ({
      userId: actor.userId,
      username: actor.username,
      email: actor.email,
      firstName: actor.firstName,
      lastName: actor.lastName,
      membership,
      folderRBACAccess,
      inheritedFolderRBACAccess
    });

    const result = await $listFolderAccessActors<TProjectMemberUser>(dto, {
      actorType: ActorType.USER,
      fetchMembers: (scope, page) => folderPermissionDAL.findProjectUsersWithRoles(scope, page),
      actorIdOf: (user) => user.userId
    });

    return {
      users: result.withAccess.map(toUser),
      usersWithoutAccess: result.withoutAccess.map(toUser),
      totalCount: result.totalCount
    };
  };

  const listFolderAccessIdentities = async (dto: TListFolderAccessActorsDTO) => {
    const toIdentity = ({
      actor,
      membership,
      folderRBACAccess,
      inheritedFolderRBACAccess
    }: TFolderAccessItem<TProjectMemberIdentity>) => ({
      identityId: actor.identityId,
      name: actor.name,
      membership,
      folderRBACAccess,
      inheritedFolderRBACAccess
    });

    const result = await $listFolderAccessActors<TProjectMemberIdentity>(dto, {
      actorType: ActorType.IDENTITY,
      fetchMembers: (scope, page) => folderPermissionDAL.findProjectIdentitiesWithRoles(scope, page),
      actorIdOf: (identity) => identity.identityId
    });

    return {
      identities: result.withAccess.map(toIdentity),
      identitiesWithoutAccess: result.withoutAccess.map(toIdentity),
      totalCount: result.totalCount
    };
  };

  const listActorFolderGrants = async (dto: TListActorFolderGrantsDTO) => {
    const { projectId, target } = dto;
    await assertFolderRbacLicensed(dto.permission.orgId);
    const callerPermission = await getFolderAccessPermission(dto.permission, projectId, permissionService);
    assertReadActorGrantsAccess(callerPermission, target);

    const rows = await additionalPrivilegeDAL.find({
      projectId,
      [targetActorField(target)]: target.actorId,
      $notNull: ["folderId"]
    });
    const grantRows = rows.filter((row) => row.role);
    if (!grantRows.length) return { folderAccess: [] };

    const folders = await secretFolderDAL.findSecretPathByFolderIds(
      projectId,
      grantRows.map((row) => row.folderId as string)
    );

    const folderAccess = grantRows
      .flatMap((row, idx) => {
        const folder = folders[idx];
        if (!folder) return [];
        return [
          toFolderGrant(row, projectId, { id: folder.id, path: folder.path, environmentSlug: folder.environmentSlug })
        ];
      })
      .sort((a, b) => a.environment.localeCompare(b.environment) || a.secretPath.localeCompare(b.secretPath));

    return { folderAccess };
  };

  return {
    createFolderGrant,
    updateFolderGrant,
    deleteFolderGrant,
    listFolderAccessUsers,
    listFolderAccessIdentities,
    listActorFolderGrants
  };
};
