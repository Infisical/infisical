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

import { useAccess } from "../context";
import {
  type AccessData,
  type AuthMethod,
  authMethodNames,
  type OrgIdentity,
  type ProjectIdentity
} from "../model";

import styles from "./identity.module.css";

export const DEMO_PROJECT = "payments-api";
export const TODAY = "Oct 30, 2026";
export const DELETE_PROTECTED = "Delete protection is enabled";
export const ASSUME_HINT =
  "Assume the privileges of this machine identity, allowing you to replicate their access behavior.";

export type ProjectIdentityRow = { membership: ProjectIdentity; identity: OrgIdentity };

export const projectIdentityRows = (data: AccessData): ProjectIdentityRow[] =>
  data.projectIdentities.flatMap((membership) => {
    const identity = data.orgIdentities.find((item) => item.id === membership.identityId);
    return identity ? [{ membership, identity }] : [];
  });

export const lockedMethods = (identity: OrgIdentity): AuthMethod[] =>
  identity.lockedOut ? identity.authMethods.filter((method) => method === "universal") : [];

export const ManagedByBadge = ({ identity }: { identity: OrgIdentity }) =>
  identity.managedByProject ? (
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

export const lockoutText = (identity: OrgIdentity) => {
  const locked = lockedMethods(identity);
  return locked.length
    ? `Locked out: ${locked.map((method) => authMethodNames[method]).join(", ")}`
    : undefined;
};

export const AssumePrivilegesDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { saved } = useAccess();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent confirmText="assume">
        <AlertDialogHeader>
          <AlertDialogTitle>Assume privileges of this machine identity</AlertDialogTitle>
          <AlertDialogDescription>
            This will set your privileges to those of the machine identity for the next hour.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);
              saved("Machine identity privilege assumption has started");
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
  row,
  from,
  onOpenChange,
  onDone
}: {
  row?: ProjectIdentityRow;
  from: "list" | "detail";
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) => {
  const { update, saved } = useAccess();
  const isProjectIdentity = Boolean(row?.identity.managedByProject);
  const name = row?.identity.name || "machine identity";
  const removeTitle =
    from === "list" ? `Remove ${name} from project?` : `Remove ${name} from the project?`;
  return (
    <AlertDialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <AlertDialogContent
        tone="danger"
        confirmText={isProjectIdentity || from === "list" ? "confirm" : "remove"}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{isProjectIdentity ? `Delete ${name}?` : removeTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {isProjectIdentity
              ? "This permanently deletes the project machine identity and revokes its access. This cannot be undone."
              : "The machine identity will lose access to this project but remain available in its organization."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (!row) return;
              const { id } = row.identity;
              update((current) => ({
                ...current,
                projectIdentities: current.projectIdentities.filter((m) => m.identityId !== id),
                orgIdentities: isProjectIdentity
                  ? current.orgIdentities.filter((identity) => identity.id !== id)
                  : current.orgIdentities
              }));
              onOpenChange(false);
              saved(
                isProjectIdentity
                  ? "Successfully deleted project machine identity"
                  : "Successfully removed machine identity from project"
              );
              onDone?.();
            }}
          >
            {isProjectIdentity ? "Delete" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
