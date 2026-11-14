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

import { errorMessage } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { MoveSecretsDialog } from "../bulk/move-secrets-dialog";
import { childPath } from "../flows/shared";
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
  if (action && action !== last) {
    setLast(action);
    setSession(session + 1);
  }
  const blockFor = useManagedBlock(scope.project);
  const environment = scope.visibleEnvironments[0];
  const folderPath = last ? childPath(last.entry.path, last.entry.name) : "";
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
  const fromUser = (user: TFolderAccessUser): [AccessMember, FolderGrant | undefined] => [
    {
      type: "user",
      id: user.userId,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username,
      subtitle: user.email ?? user.username,
      isProjectAdmin: user.membership.isProjectAdmin,
      roles: user.membership.roles.map((role) => role.name),
      inProject: true
    },
    toGrant(user.folderRBACAccess)
  ];
  const fromIdentity = (
    identity: TFolderAccessIdentity
  ): [AccessMember, FolderGrant | undefined] => [
    {
      type: "identity",
      id: identity.identityId,
      name: identity.name,
      subtitle: "Machine identity",
      isProjectAdmin: identity.membership.isProjectAdmin,
      roles: identity.membership.roles.map((role) => role.name),
      inProject: true
    },
    toGrant(identity.folderRBACAccess)
  ];
  const entries = [
    ...[...(users?.users ?? []), ...(users?.usersWithoutAccess ?? [])].map(fromUser),
    ...[...(identities?.identities ?? []), ...(identities?.identitiesWithoutAccess ?? [])].map(
      fromIdentity
    )
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
      folderPath={folderPath}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onChange={applyAccess}
      onSuccess={(title) => onToast("ok", { title })}
      manageBlock={manageBlock}
    />
  );
}
