import slugify from "@sindresorhus/slugify";

import { SecretFolderRole } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCacheFingerprint } from "@app/lib/cache/with-cache";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { ActorType } from "../auth/auth-type";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import {
  buildFolderAccessRoster,
  matchesSearch,
  paginateRoster,
  reviveFolderAccessRoster,
  sortRosterEntries,
  splitFolderAccessRoster
} from "./folder-access-roles-fns";
import { TFolderPermissionDALFactory } from "./folder-permission-dal";
import {
  assertFullAccessIsPermanent,
  assertGrantTargetEligible,
  assertManageFolderAccess,
  assertReadActorGrantsAccess,
  computeTemporaryFields,
  getFolderAccessPermission,
  resolveFolder,
  targetActorField,
  targetLabel,
  toFolderGrant
} from "./folder-permission-fns";
import {
  TCachedFolderAccessRoster,
  TCreateFolderGrantDTO,
  TDeleteFolderGrantDTO,
  TFolderAccessMembership,
  TFolderAccessRosterEntry,
  TFolderGrant,
  TListActorFolderGrantsDTO,
  TListFolderAccessActorsDTO,
  TResolvedFolder,
  TRosterActor,
  TRosterEntry,
  TRosterIdentity,
  TRosterUser,
  TUpdateFolderGrantDTO
} from "./folder-permission-types";

type TFolderPermissionServiceFactoryDep = {
  additionalPrivilegeDAL: Pick<
    TAdditionalPrivilegeDALFactory,
    "findOne" | "find" | "create" | "updateById" | "deleteById" | "transaction"
  >;
  secretFolderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "invalidateProjectFolderPermissionCache">;
  folderPermissionDAL: Pick<
    TFolderPermissionDALFactory,
    | "findProjectUserRoster"
    | "findProjectIdentityRoster"
    | "getFolderAccessRosterFingerprint"
    | "hasProjectAccess"
    | "isProjectAdmin"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

type TFolderActorType = ActorType.USER | ActorType.IDENTITY;

type TProjectScope = { projectId: string; orgId: string };

type TFolderAccessItem<TActor extends TRosterActor> = {
  actor: TActor;
  membership: TFolderAccessMembership;
  folderRBACAccess: TFolderGrant | null;
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
    await assertGrantTargetEligible(dto.permission.orgId, projectId, target, folderPermissionDAL);

    const actorField = targetActorField(target);
    const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
      const existing = await additionalPrivilegeDAL.findOne(
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

      const doc = await additionalPrivilegeDAL.updateById(
        existing.id,
        {
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.type === undefined ? {} : computeTemporaryFields(dto.type))
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
      const existing = await additionalPrivilegeDAL.findOne(
        { projectId, folderId: folder.id, [actorField]: target.actorId },
        tx
      );
      if (!existing) {
        throw new NotFoundError({
          message: `No folder access found for ${targetLabel(target).toLowerCase()} with ID '${target.actorId}' on the folder at path '${folder.path}' in environment with slug '${folder.environmentSlug}'`
        });
      }

      const doc = await additionalPrivilegeDAL.deleteById(existing.id, tx);
      await permissionService.invalidateProjectFolderPermissionCache(projectId, tx);
      return doc;
    });

    return { folderAccess: toFolderGrant(grant, projectId, folder) };
  };

  const $getFolderAccessRoster = <TActor extends TRosterActor>(
    { projectId, orgId, folder, actorType }: TProjectScope & { folder: TResolvedFolder; actorType: TFolderActorType },
    fetchRoster: () => Promise<TRosterEntry<TActor>[]>
  ) =>
    withCacheFingerprint<TCachedFolderAccessRoster<TActor>>({
      keyStore,
      dataKey: KeyStorePrefixes.ProjectFolderAccessRosterData(projectId, folder.id, actorType),
      markerKey: KeyStorePrefixes.ProjectFolderAccessRosterMarker(projectId, folder.id, actorType),
      markerTtlSeconds: KeyStoreTtls.ProjectFolderAccessRosterMarkerTtlSeconds,
      dataTtlSeconds: KeyStoreTtls.ProjectFolderAccessRosterDataTtlSeconds,
      // the key is by folder id but the granting roles are evaluated against the folder's path, and a
      // rename or move changes neither the id nor anything the DB fingerprint tracks
      fingerprintFetcher: async () => {
        const fingerprint = await folderPermissionDAL.getFolderAccessRosterFingerprint({ projectId, orgId, actorType });
        return `${fingerprint}|${folder.environmentSlug}|${folder.path}`;
      },
      dataFetcher: async () => buildFolderAccessRoster(await fetchRoster(), folder),
      reviver: reviveFolderAccessRoster
    });

  const $listFolderAccessActors = async <TActor extends TRosterActor>(
    dto: TListFolderAccessActorsDTO,
    {
      actorType,
      fetchRoster,
      actorIdOf,
      searchFields,
      sortKey
    }: {
      actorType: TFolderActorType;
      fetchRoster: (scope: TProjectScope) => Promise<TRosterEntry<TActor>[]>;
      actorIdOf: (actor: TActor) => string;
      searchFields: (actor: TActor) => (string | null)[];
      sortKey: (actor: TActor) => [name: string, tieBreak: string];
    }
  ) => {
    const { projectId, environmentSlug, secretPath, limit, offset, search } = dto;
    const { orgId } = dto.permission;
    await assertFolderRbacLicensed(orgId);
    const callerPermission = await getFolderAccessPermission(dto.permission, projectId, permissionService);
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    assertManageFolderAccess(callerPermission, folder);

    const actorField = actorType === ActorType.USER ? "actorUserId" : "actorIdentityId";
    // grants stay out of the cached roster so a grant or revoke is visible on the very next request
    const [roster, grants] = await Promise.all([
      $getFolderAccessRoster<TActor>({ projectId, orgId, folder, actorType }, () => fetchRoster({ projectId, orgId })),
      additionalPrivilegeDAL.find({ projectId, folderId: folder.id, $notNull: [actorField] })
    ]);
    const grantByActorId = new Map(
      grants.filter((grant) => grant.role).map((grant) => [grant[actorField] as string, grant])
    );

    const { withAccess, withoutAccess } = splitFolderAccessRoster({
      roster,
      grantByActorId,
      actorIdOf,
      now: new Date()
    });

    const page = (entries: TFolderAccessRosterEntry<TActor>[]) =>
      paginateRoster(
        sortRosterEntries(
          entries.filter((entry) => matchesSearch(search, searchFields(entry.actor))),
          (entry) => sortKey(entry.actor)
        ),
        offset,
        limit
      );
    const toItem = ({ actor, membership, grant }: TFolderAccessRosterEntry<TActor>): TFolderAccessItem<TActor> => ({
      actor,
      membership,
      folderRBACAccess: grant ? toFolderGrant(grant, projectId, folder) : null
    });

    const withAccessPage = page(withAccess);
    const withoutAccessPage = page(withoutAccess);
    return {
      withAccess: withAccessPage.items.map(toItem),
      totalCount: withAccessPage.totalCount,
      withoutAccess: withoutAccessPage.items.map(toItem),
      totalCountWithoutAccess: withoutAccessPage.totalCount
    };
  };

  const listFolderAccessUsers = async (dto: TListFolderAccessActorsDTO) => {
    const toUser = ({ actor, membership, folderRBACAccess }: TFolderAccessItem<TRosterUser>) => ({
      userId: actor.userId,
      username: actor.username,
      email: actor.email,
      firstName: actor.firstName,
      lastName: actor.lastName,
      membership,
      folderRBACAccess
    });

    const result = await $listFolderAccessActors<TRosterUser>(dto, {
      actorType: ActorType.USER,
      fetchRoster: (scope) => folderPermissionDAL.findProjectUserRoster(scope),
      actorIdOf: (user) => user.userId,
      searchFields: (user) => [user.username, user.email, user.firstName, user.lastName],
      sortKey: (user) => [user.username, user.userId]
    });

    return {
      users: result.withAccess.map(toUser),
      usersWithoutAccess: result.withoutAccess.map(toUser),
      totalCount: result.totalCount,
      totalCountWithoutAccess: result.totalCountWithoutAccess
    };
  };

  const listFolderAccessIdentities = async (dto: TListFolderAccessActorsDTO) => {
    const toIdentity = ({ actor, membership, folderRBACAccess }: TFolderAccessItem<TRosterIdentity>) => ({
      identityId: actor.identityId,
      name: actor.name,
      membership,
      folderRBACAccess
    });

    const result = await $listFolderAccessActors<TRosterIdentity>(dto, {
      actorType: ActorType.IDENTITY,
      fetchRoster: (scope) => folderPermissionDAL.findProjectIdentityRoster(scope),
      actorIdOf: (identity) => identity.identityId,
      searchFields: (identity) => [identity.name],
      sortKey: (identity) => [identity.name, identity.identityId]
    });

    return {
      identities: result.withAccess.map(toIdentity),
      identitiesWithoutAccess: result.withoutAccess.map(toIdentity),
      totalCount: result.totalCount,
      totalCountWithoutAccess: result.totalCountWithoutAccess
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

    // a grant whose folder no longer resolves (soft-deleted environment) is omitted, matching how
    // the permission layer treats it
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
