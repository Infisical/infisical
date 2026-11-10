import { useState } from "react";
import { subject } from "@casl/ability";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Icon } from "@app/components/v4/ui/icon";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";
import { getProjectHomePage } from "@app/helpers/project";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { identityAuthToNameMap } from "@app/hooks/api/identities/constants";
import type { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type { Identity, IdentityProjectMembershipV2 } from "@app/hooks/api/identities/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { V4_DEMO_ORG_ID } from "../../mode";
import { failed, saved } from "../toast";
import { accessLabel, accessNoun, accessThe, accessThis } from "./product";
import { useProjectScope } from "./scope";

import styles from "./identity.module.css";

export const DELETE_PROTECTED = "Delete protection is enabled";

export type ProjectIdentityMembership = Pick<
  IdentityProjectMembershipV2,
  "id" | "identity" | "roles" | "createdAt" | "lastLoginTime" | "lastLoginAuthMethod"
>;

export type AuthIdentity = Pick<
  Identity,
  "id" | "name" | "authMethods" | "activeLockoutAuthMethods" | "projectId"
>;

export const identitySubject = (identityId: string) =>
  subject(ProjectPermissionSub.Identity, { identityId });

export const authMethodName = (method: IdentityAuthMethod) => identityAuthToNameMap[method];

export const isProjectManaged = (identity: Pick<Identity, "projectId">) =>
  Boolean(identity.projectId);

export const ManagedByBadge = ({ identity }: { identity: Pick<Identity, "projectId"> }) =>
  isProjectManaged(identity) ? (
    <Badge tone="soft">
      <Icon name="folder" size={12} />
      Project
    </Badge>
  ) : (
    <Badge tone="outline">
      <Icon name="building" size={12} />
      Organization
    </Badge>
  );

export const LockedBadge = ({ label }: { label: string }) => (
  <Tooltip content={label}>
    <span className={styles.lock}>
      <Badge tone="bad" aria-label={label}>
        <Icon name="lock" size={12} />
      </Badge>
    </span>
  </Tooltip>
);

export const lockoutText = (identity: Pick<Identity, "activeLockoutAuthMethods">) =>
  identity.activeLockoutAuthMethods?.length
    ? `Locked out: ${identity.activeLockoutAuthMethods.map(authMethodName).join(", ")}`
    : undefined;

export const AssumePrivilegesDialog = ({
  orgId,
  projectId,
  identityId,
  onOpenChange
}: {
  orgId: string;
  projectId: string;
  identityId?: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const { projectType } = useProjectScope();
  const assume = useV4Adapter("access").useAssumeProjectPrivileges();
  const [pending, setPending] = useState(false);
  const run = async () => {
    if (!identityId) return;
    setPending(true);
    try {
      await assume.mutateAsync({ projectId, actorId: identityId, actorType: ActorType.IDENTITY });
      saved("Machine identity privilege assumption has started");
      onOpenChange(false);
      if (orgId !== V4_DEMO_ORG_ID)
        window.location.assign(
          getProjectHomePage(projectType, [])
            .replace("$orgId", orgId)
            .replace("$projectId", projectId)
        );
    } catch (error) {
      failed("Failed to assume machine identity privileges", error);
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={Boolean(identityId)} onOpenChange={onOpenChange}>
      <AlertDialogContent confirmText="assume" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Assume privileges of this machine identity</AlertDialogTitle>
          <AlertDialogDescription>
            Your privileges become this machine identity&apos;s for one hour.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              run();
            }}
          >
            Assume privileges
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const IdentityRemovalDialog = ({
  projectId,
  identity,
  from,
  onOpenChange,
  onDone
}: {
  projectId: string;
  identity?: Pick<Identity, "id" | "name" | "projectId">;
  from: "list" | "detail";
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) => {
  const { projectType } = useProjectScope();
  const access = useV4Adapter("access");
  const removeMembership = access.useRemoveProjectIdentity();
  const removePamMembership = useV4Adapter("pam").useRemoveProductIdentityMember();
  const revokeAgentVaultMembers = useV4Adapter("agentVault").useRevokeMembers(projectId);
  const deleteIdentity = access.useDeleteProjectManagedIdentity();
  const [pending, setPending] = useState(false);
  const isProjectIdentity = Boolean(identity && isProjectManaged(identity));
  const name = identity?.name || "machine identity";
  const removeTitle =
    from === "list"
      ? `Remove ${name} from ${accessNoun(projectType)}?`
      : `Remove ${name} from ${accessThe(projectType)}?`;
  const run = async () => {
    if (!identity) return;
    setPending(true);
    try {
      if (isProjectIdentity) {
        await deleteIdentity.mutateAsync({ projectId, identityId: identity.id });
        saved(`Successfully deleted ${accessLabel(projectType, "machine identity").toLowerCase()}`);
      } else {
        if (projectType === ProjectType.PAM)
          await removePamMembership.mutateAsync({ projectId, identityId: identity.id });
        else if (projectType === ProjectType.AgentVault)
          await revokeAgentVaultMembers.mutateAsync({ machineIdentityIds: [identity.id] });
        else
          await removeMembership.mutateAsync({ projectId, projectType, identityId: identity.id });
        saved(`Successfully removed machine identity from ${accessNoun(projectType)}`);
      }
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      failed(
        isProjectIdentity
          ? `Failed to delete ${accessLabel(projectType, "machine identity").toLowerCase()}`
          : `Failed to remove machine identity from ${accessNoun(projectType)}`,
        error
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={Boolean(identity)} onOpenChange={onOpenChange}>
      <AlertDialogContent
        tone="danger"
        pending={pending}
        confirmText={isProjectIdentity || from === "list" ? "confirm" : "remove"}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{isProjectIdentity ? `Delete ${name}?` : removeTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {isProjectIdentity
              ? "Deletes the machine identity and revokes its access. This cannot be undone."
              : `It loses access to ${accessThis(projectType)} but stays in the organization.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              run();
            }}
          >
            {isProjectIdentity ? "Delete" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
