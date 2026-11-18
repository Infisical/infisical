import { useState } from "react";

import {
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type {
  TFolderAccess,
  TFolderAccessIdentity,
  TFolderAccessUser,
  TFolderGrantType
} from "@app/hooks/api/folderAccess/types";
import { wasErrorReported } from "@app/hooks/api/reactQuery";
import { normalizeFolderPath } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";

import { errorMessage } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { MoveSecretsDialog } from "../bulk/move-secrets-dialog";
import {
  type AccessMember,
  type AccessState,
  FolderAccessSheet,
  type FolderGrant,
  grantKey,
  memberKey
} from "./folder-access-sheet";
import { useManagedBlock } from "./permissions";
import type { RowActionHostProps } from "./types";

const toGrant = (access: TFolderAccess | null): FolderGrant | undefined =>
  access
    ? {
        permission: access.permission,
        isTemporary: access.isTemporary,
        temporaryRange: access.temporaryRange,
        temporaryAccessEndTime: access.temporaryAccessEndTime
      }
    : undefined;

const toGrantType = (grant: FolderGrant): TFolderGrantType =>
  grant.isTemporary && grant.temporaryRange
    ? {
        isTemporary: true,
        temporaryMode: "relative",
        temporaryRange: grant.temporaryRange,
        temporaryAccessStartTime: new Date().toISOString()
      }
    : { isTemporary: false };

export function FolderActions({
  action,
  onClose,
  scope,
  resources,
  onApply,
  onToast
}: RowActionHostProps<"folder">) {
  const adapter = useV4Adapter("secrets");
  const [last, setLast] = useState(action);
  const [session, setSession] = useState(0);
  const [accessScope, setAccessScope] = useState({ environment: "", secretPath: "/" });
  if (action && action !== last) {
    setLast(action);
    setSession(session + 1);
    if (action.action === "access")
      setAccessScope({
        environment: action.environment,
        secretPath: normalizeFolderPath(action.secretPath)
      });
  }
  const blockFor = useManagedBlock(scope.project);
  const folderTree = adapter.useProjectFolders(scope.project).data;
  const folderPathsIn = (slug: string) => [
    ...new Set(
      Object.values(folderTree ?? {})
        .find((entry) => entry.slug === slug)
        ?.folders.map((folder) => normalizeFolderPath(folder.path)) ?? []
    )
  ];
  const environment =
    scope.environments.find((entry) => entry.value === accessScope.environment) ??
    scope.environments[0];
  const folderPath = accessScope.secretPath;
  const manageBlock = blockFor(
    ProjectPermissionSub.SecretFolders,
    ProjectPermissionSecretFolderActions.ManageAccess,
    { environment: environment?.value ?? "", secretPath: folderPath },
    "manage access to this folder"
  );
  const target = {
    projectId: scope.project,
    environmentSlug: environment?.value ?? "",
    secretPath: last?.action === "access" && !manageBlock ? folderPath : ""
  };
  const users = adapter.useFolderAccessUsers(target).data;
  const identities = adapter.useFolderAccessIdentities(target).data;
  const createUser = adapter.useCreateUserFolderAccess();
  const updateUser = adapter.useUpdateUserFolderAccess();
  const deleteUser = adapter.useDeleteUserFolderAccess();
  const createIdentity = adapter.useCreateIdentityFolderAccess();
  const updateIdentity = adapter.useUpdateIdentityFolderAccess();
  const deleteIdentity = adapter.useDeleteIdentityFolderAccess();
  if (!last) return null;

  const key = grantKey(target.environmentSlug, folderPath);
  const fromUser =
    (hasAccess: boolean) =>
    (user: TFolderAccessUser): [AccessMember, FolderGrant | undefined] => [
      {
        type: "user",
        id: user.userId,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username,
        subtitle: user.email ?? user.username,
        isProjectAdmin: user.membership.isProjectAdmin,
        roles: user.membership.roles.map((role) => role.name),
        inProject: true,
        hasAccess
      },
      toGrant(user.folderRBACAccess)
    ];
  const fromIdentity =
    (hasAccess: boolean) =>
    (identity: TFolderAccessIdentity): [AccessMember, FolderGrant | undefined] => [
      {
        type: "identity",
        id: identity.identityId,
        name: identity.name,
        subtitle: "Machine identity",
        isProjectAdmin: identity.membership.isProjectAdmin,
        roles: identity.membership.roles.map((role) => role.name),
        inProject: true,
        hasAccess
      },
      toGrant(identity.folderRBACAccess)
    ];
  const entries = [
    ...(users?.users ?? []).map(fromUser(true)),
    ...(users?.usersWithoutAccess ?? []).map(fromUser(false)),
    ...(identities?.identities ?? []).map(fromIdentity(true)),
    ...(identities?.identitiesWithoutAccess ?? []).map(fromIdentity(false))
  ];
  const access: AccessState = {
    members: entries.map(([member]) => member),
    grants: {
      [key]: Object.fromEntries(
        entries.flatMap(([member, grant]) => (grant ? [[memberKey(member), grant]] : []))
      )
    }
  };

  const failed = (error: unknown) =>
    !wasErrorReported(error) &&
    onToast("bad", {
      title: "Failed to update folder access",
      description: errorMessage(error)
    });
  const save = (member: AccessMember, before?: FolderGrant, after?: FolderGrant) => {
    const scoped = { ...target, secretPath: folderPath };
    const actor =
      member.type === "user"
        ? { create: createUser, update: updateUser, remove: deleteUser, id: { userId: member.id } }
        : {
            create: createIdentity,
            update: updateIdentity,
            remove: deleteIdentity,
            id: { identityId: member.id }
          };
    if (!after)
      return (actor.remove.mutateAsync as (dto: object) => Promise<unknown>)({
        ...scoped,
        ...actor.id
      });
    const dto = {
      ...scoped,
      ...actor.id,
      permission: after.permission,
      type: toGrantType(after)
    };
    return (
      (before ? actor.update : actor.create).mutateAsync as (dto: object) => Promise<unknown>
    )(dto);
  };
  const applyAccess = (update: (current: AccessState) => AccessState) => {
    const next = update(access);
    const before = access.grants[key] ?? {};
    const after = next.grants[key] ?? {};
    return Promise.all(
      access.members
        .filter(
          (member) =>
            JSON.stringify(before[memberKey(member)]) !== JSON.stringify(after[memberKey(member)])
        )
        .map((member) => save(member, before[memberKey(member)], after[memberKey(member)]))
    ).catch(failed);
  };

  if (last.action === "move")
    return (
      <MoveSecretsDialog
        key={session}
        open={action?.action === "move"}
        targets={last.entries}
        scope={scope}
        resources={resources}
        onClose={onClose}
        onApply={onApply}
        onToast={onToast}
      />
    );

  return (
    <FolderAccessSheet
      key={session}
      open={action?.action === "access"}
      state={access}
      environmentSlug={target.environmentSlug}
      environmentName={environment?.label ?? ""}
      environments={scope.environments}
      folderPath={folderPath}
      folderPaths={folderPathsIn(target.environmentSlug)}
      onEnvironmentChange={(slug) =>
        setAccessScope({
          environment: slug,
          secretPath: folderPathsIn(slug).includes(folderPath) ? folderPath : "/"
        })
      }
      onFolderPathChange={(secretPath) => setAccessScope({ ...accessScope, secretPath })}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onChange={applyAccess}
      onSuccess={(title) => onToast("ok", { title })}
      manageBlock={manageBlock}
    />
  );
}
