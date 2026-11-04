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
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  dynamicSecretDefinitionFor,
  DynamicSecretEditSheet,
  type DynamicSecretResource
} from "../flows/dynamic-secret-flow";
import { environmentLabel, LOCAL_ONLY } from "../flows/shared";
import {
  DynamicSecretLeaseDialog,
  fakeLeaseData,
  type LeaseRequest
} from "./dynamic-secret-lease-provision";
import { type DynamicSecretLease, DynamicSecretLeasesDialog, toMs } from "./dynamic-secret-leases";
import type { RowActionHostProps } from "./types";

const SEEDED_AT = Date.now();
const HOUR = 60 * 60 * 1000;

const fakeUuid = (seed: string, salt: number) => {
  const hex = Array.from({ length: 32 }, (_, index) =>
    ((seed.charCodeAt((index * 7 + salt) % seed.length) * (index + salt + 3)) % 16).toString(16)
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};

const seedLeases = (entry: DynamicSecretResource): DynamicSecretLease[] =>
  entry.config
    ? []
    : [
        { id: fakeUuid(entry.id, 1), expireAt: new Date(SEEDED_AT + 0.75 * HOUR).toISOString() },
        {
          id: fakeUuid(entry.id, 2),
          expireAt: new Date(SEEDED_AT + 20 * HOUR).toISOString(),
          ...(entry.status === "failed-deletion"
            ? {
                status: "failed-deletion" as const,
                statusDetails: "Simulated provider error while revoking this lease."
              }
            : {})
        }
      ];

const providerOf = (entry: DynamicSecretResource) =>
  dynamicSecretDefinitionFor(entry)?.provider ?? DynamicSecretProviders.SqlDatabase;

export function DynamicSecretActions({
  action,
  onClose,
  resources,
  onApply,
  onToast
}: RowActionHostProps<"dynamic">) {
  const [leases, setLeases] = useState<Record<string, DynamicSecretLease[]>>({});
  const [newLeaseFor, setNewLeaseFor] = useState<DynamicSecretResource>();
  const [session, setSession] = useState(0);
  const [previousAction, setPreviousAction] = useState(action);
  if (action !== previousAction) {
    setPreviousAction(action);
    if (action) setSession((value) => value + 1);
  }

  const entry =
    action &&
    (resources.find(
      (resource): resource is DynamicSecretResource =>
        resource.kind === "dynamic" && resource.id === action.entry.id
    ) ??
      action.entry);
  const kind = action?.action;
  const lastDeleted = useRef<{ entry: DynamicSecretResource; isForced: boolean }>(undefined);
  if (entry && (kind === "delete" || kind === "force-delete"))
    lastDeleted.current = { entry, isForced: kind === "force-delete" };

  const leasesOf = (item: DynamicSecretResource) => leases[item.id] ?? seedLeases(item);
  const updateLeases = (
    item: DynamicSecretResource,
    update: (current: DynamicSecretLease[]) => DynamicSecretLease[]
  ) =>
    setLeases((current) => ({
      ...current,
      [item.id]: update(current[item.id] ?? seedLeases(item))
    }));

  const leaseTarget = newLeaseFor ?? (kind === "lease" ? entry : undefined);
  const lastLeaseTarget = useRef(leaseTarget);
  if (leaseTarget) lastLeaseTarget.current = leaseTarget;
  const leaseProvider = lastLeaseTarget.current
    ? providerOf(lastLeaseTarget.current)
    : DynamicSecretProviders.SqlDatabase;

  const provision = (request: LeaseRequest) => {
    const item = leaseTarget ?? lastLeaseTarget.current;
    const { fixedTtl, output } =
      getDynamicSecretProviderRuntimeMetadata(leaseProvider).leaseCapabilities;
    const expireAt = new Date(
      Date.now() + (toMs(fixedTtl ?? request.ttl) ?? toMs("1h") ?? HOUR)
    ).toISOString();
    if (item && output.type !== "totp")
      updateLeases(item, (current) => [...current, { id: crypto.randomUUID(), expireAt }]);
    onToast("ok", { title: "Successfully leased dynamic secret", description: LOCAL_ONLY });
    return {
      expireAt,
      data: fakeLeaseData(leaseProvider, item?.name ?? "lease", expireAt, request.config)
    };
  };

  const deleted = lastDeleted.current;

  return (
    <>
      <DynamicSecretLeasesDialog
        entry={kind === "leases" ? entry : undefined}
        leases={entry ? leasesOf(entry) : []}
        canRenew={
          entry
            ? getDynamicSecretProviderRuntimeMetadata(providerOf(entry)).leaseCapabilities
                .supportsRenewal
            : false
        }
        onClose={onClose}
        onNewLease={() => {
          if (!entry) return;
          setSession((value) => value + 1);
          setNewLeaseFor(entry);
        }}
        onRenew={(leaseId, ttl) => {
          if (!entry) return;
          updateLeases(entry, (current) =>
            current.map((lease) =>
              lease.id === leaseId
                ? {
                    ...lease,
                    expireAt: new Date(
                      new Date(lease.expireAt).getTime() + (toMs(ttl) ?? 0)
                    ).toISOString()
                  }
                : lease
            )
          );
          onToast("ok", { title: "Successfully renewed lease", description: LOCAL_ONLY });
        }}
        onRevoke={(leaseId, isForced) => {
          if (!entry) return;
          updateLeases(entry, (current) => current.filter((lease) => lease.id !== leaseId));
          onToast("ok", {
            title: isForced ? "Lease deleted" : "Lease revoked",
            description: LOCAL_ONLY
          });
        }}
      />
      <DynamicSecretLeaseDialog
        key={session}
        entry={leaseTarget}
        provider={leaseProvider}
        onClose={() => (newLeaseFor ? setNewLeaseFor(undefined) : onClose())}
        onProvision={provision}
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
            { title: successMessage, description: LOCAL_ONLY }
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
                ? "This removes the dynamic secret and its leases from Infisical without revoking them in the external provider. This cannot be undone."
                : "This deletes the dynamic secret configuration and revokes its active leases. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!entry) return;
                onApply((current) => current.filter((resource) => resource.id !== entry.id), {
                  title: "Dynamic secret deleted",
                  description: LOCAL_ONLY
                });
                setLeases(({ [entry.id]: _removed, ...rest }) => rest);
              }}
            >
              {deleted?.isForced ? "Force delete" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
