import { useRef, useState } from "react";

import { getDynamicSecretProviderRuntimeMetadata } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/runtimeMetadata";
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
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { DynamicSecretLeaseStatus } from "@app/hooks/api/dynamicSecretLease/types";

import { errorMessage } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import {
  dynamicSecretDefinitionFor,
  DynamicSecretEditSheet,
  type DynamicSecretResource
} from "../flows/dynamic-secret-flow";
import { environmentLabel, Gate } from "../flows/shared";
import type { LeaseRequest } from "./dynamic-secret-lease-provision";
import type { DynamicSecretLease } from "./dynamic-secret-leases";
import { DynamicSecretLeasesSheet } from "./dynamic-secret-leases-sheet";
import { useManagedBlock } from "./permissions";
import type { RowActionHostProps } from "./types";

const providerOf = (entry: DynamicSecretResource) =>
  dynamicSecretDefinitionFor(entry)?.provider ?? DynamicSecretProviders.SqlDatabase;

export function DynamicSecretActions({
  action,
  onClose,
  scope,
  resources,
  onApply,
  onToast
}: RowActionHostProps<"dynamic">) {
  const adapter = useV4Adapter("secrets");
  const [session, setSession] = useState(0);
  const [previousAction, setPreviousAction] = useState(action);
  if (action !== previousAction) {
    setPreviousAction(action);
    if (action) setSession((value) => value + 1);
  }

  const listed =
    action &&
    (resources.find(
      (resource): resource is DynamicSecretResource =>
        resource.kind === "dynamic" && resource.id === action.entry.id
    ) ??
      action.entry);
  const kind = action?.action;
  const projectSlug = adapter.useProject(scope.project).data?.slug ?? scope.project;
  const target = (item?: DynamicSecretResource) => ({
    projectSlug,
    environmentSlug: item?.environment ?? "",
    path: item?.path ?? "",
    name: item?.name ?? ""
  });
  const details = adapter.useDynamicSecretDetails(
    target(kind === "edit" && !listed?.config ? listed : undefined)
  ).data;
  const entry: DynamicSecretResource | undefined =
    listed && kind === "edit" && !listed.config && details
      ? {
          ...listed,
          config: {
            type: details.type,
            inputs: details.inputs,
            usernameTemplate: details.usernameTemplate,
            metadata: details.metadata
          }
        }
      : listed;
  const lastDeleted = useRef<{ entry: DynamicSecretResource; isForced: boolean }>(undefined);
  if (entry && (kind === "delete" || kind === "force-delete"))
    lastDeleted.current = { entry, isForced: kind === "force-delete" };

  const blockFor = useManagedBlock(scope.project);
  const dynamicBlock = (
    item: DynamicSecretResource | undefined,
    permissionAction: string,
    verb: string
  ) =>
    item
      ? blockFor(
          ProjectPermissionSub.DynamicSecrets,
          permissionAction,
          { environment: item.environment, secretPath: item.path },
          verb
        )
      : undefined;
  const leaseBlock = dynamicBlock(
    kind === "leases" ? entry : undefined,
    ProjectPermissionDynamicSecretActions.Lease,
    "lease this dynamic secret"
  );
  const { name: dynamicSecretName, ...leaseScope } = target(entry);
  const leaseQuery = adapter.useDynamicSecretLeases({
    ...leaseScope,
    dynamicSecretName,
    enabled: kind === "leases" && !leaseBlock
  });
  const leases: DynamicSecretLease[] = (leaseQuery.data ?? []).map((lease) => ({
    id: lease.id,
    expireAt: lease.expireAt,
    ...(lease.status === DynamicSecretLeaseStatus.FailedDeletion
      ? { status: "failed-deletion" as const, statusDetails: lease.statusDetails }
      : {})
  }));
  const createLease = adapter.useCreateDynamicSecretLease();
  const renewLease = adapter.useRenewDynamicSecretLease();
  const revokeLease = adapter.useRevokeDynamicSecretLease();
  const deleteDynamicSecret = adapter.useDeleteDynamicSecret();
  const failed = (title: string) => (error: unknown) =>
    onToast("bad", {
      title,
      description: errorMessage(error)
    });

  const leaseTarget = kind === "leases" ? entry : undefined;
  const lastLeaseTarget = useRef(leaseTarget);
  if (leaseTarget) lastLeaseTarget.current = leaseTarget;
  const leaseProvider = lastLeaseTarget.current
    ? providerOf(lastLeaseTarget.current)
    : DynamicSecretProviders.SqlDatabase;

  const provision = async (request: LeaseRequest) => {
    const item = lastLeaseTarget.current;
    if (!item) return undefined;
    const { fixedTtl } = getDynamicSecretProviderRuntimeMetadata(leaseProvider).leaseCapabilities;
    const { name, ...rest } = target(item);
    try {
      const result = await createLease.mutateAsync({
        ...rest,
        dynamicSecretName: name,
        provider: leaseProvider,
        ttl: fixedTtl ?? request.ttl,
        config: request.config
      });
      onToast("ok", { title: "Successfully leased dynamic secret" });
      return {
        expireAt: result.lease.expireAt,
        data: (result.data ?? {}) as Record<string, unknown>
      };
    } catch (error) {
      failed("Failed to lease dynamic secret")(error);
      return undefined;
    }
  };

  const deleted = lastDeleted.current;
  const deleteBlock = dynamicBlock(
    deleted?.entry,
    ProjectPermissionDynamicSecretActions.DeleteRootCredential,
    "delete this dynamic secret"
  );

  return (
    <>
      <DynamicSecretLeasesSheet
        key={session}
        entry={leaseTarget}
        provider={leaseProvider}
        leases={leases}
        loading={leaseQuery.isPending}
        onClose={onClose}
        onProvision={provision}
        onRenew={(leaseId, ttl) => {
          if (!entry) return;
          const { name, ...rest } = target(entry);
          renewLease
            .mutateAsync({ ...rest, dynamicSecretName: name, leaseId, ttl })
            .then(
              () => onToast("ok", { title: "Successfully renewed lease" }),
              failed("Failed to renew lease")
            );
        }}
        leaseBlock={leaseBlock}
        onRevoke={(leaseId, isForced) => {
          if (!entry) return;
          const { name, ...rest } = target(entry);
          revokeLease
            .mutateAsync({ ...rest, dynamicSecretName: name, leaseId, isForced })
            .then(
              () => onToast("ok", { title: isForced ? "Lease deleted" : "Lease revoked" }),
              failed(isForced ? "Failed to delete lease" : "Failed to revoke lease")
            );
        }}
      />
      <DynamicSecretEditSheet
        entry={kind === "edit" ? entry : undefined}
        onClose={onClose}
        onSave={(updated, successMessage) => {
          const duplicate = resources.some(
            (resource) =>
              resource.kind === "dynamic" &&
              resource.id !== updated.id &&
              resource.project === updated.project &&
              resource.environment === updated.environment &&
              resource.path === updated.path &&
              resource.name === updated.name
          );
          if (duplicate) {
            onToast("bad", {
              title: "Dynamic secret was not updated",
              description: `A dynamic secret named ${updated.name} already exists in ${environmentLabel(updated.environment)} at ${updated.path}.`
            });
            return false;
          }
          onApply(
            (current) =>
              current.map((resource) => (resource.id === updated.id ? updated : resource)),
            { title: successMessage }
          );
          return true;
        }}
      />
      <AlertDialog
        open={kind === "delete" || kind === "force-delete"}
        onOpenChange={(next) => !next && onClose()}
      >
        <AlertDialogContent tone="danger" confirmText={deleted?.entry.name ?? ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleted?.isForced
                ? `Force delete ${deleted.entry.name}?`
                : `Delete ${deleted?.entry.name ?? "dynamic secret"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleted?.isForced
                ? "Removes it and its leases from Infisical without revoking them in the provider. This cannot be undone."
                : "Deletes the configuration and revokes its active leases. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Gate reason={deleteBlock}>
              <AlertDialogAction
                variant="destructive"
                disabled={Boolean(deleteBlock)}
                onClick={() => {
                  if (!deleted) return;
                  deleteDynamicSecret
                    .mutateAsync({ ...target(deleted.entry), isForced: deleted.isForced })
                    .then(
                      () => onToast("ok", { title: "Dynamic secret deleted" }),
                      failed("Failed to delete dynamic secret")
                    );
                }}
              >
                {deleted?.isForced ? "Force delete" : "Delete"}
              </AlertDialogAction>
            </Gate>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
