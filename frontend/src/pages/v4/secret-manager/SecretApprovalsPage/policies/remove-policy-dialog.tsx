import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Inline } from "@infisical/cipher/ui/layout";
import { Spinner } from "@infisical/cipher/ui/spinner";

import { PolicyType } from "@app/hooks/api/policies/enums";
import type { Project } from "@app/hooks/api/projects/types";

import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import type { PolicyRecord } from "./policy-sheet";

import styles from "./policies.module.css";

export const RemovePolicyDialog = ({
  policy,
  project,
  onClose
}: {
  policy?: PolicyRecord;
  project: Project;
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("approvalPolicies");
  const deleteChange = adapter.useDeleteChangePolicy();
  const deleteAccess = adapter.useDeleteAccessPolicy();
  const [pending, setPending] = useState(false);
  const isChange = policy?.policyType === PolicyType.ChangePolicy;
  const changeCount = adapter.useOpenChangeRequestCount({
    projectId: project.id,
    policyId: policy?.id ?? "",
    enabled: Boolean(policy) && isChange
  });
  const accessCount = adapter.useOpenAccessRequestCount({
    projectSlug: project.slug,
    policyId: policy?.id ?? "",
    enabled: Boolean(policy) && !isChange
  });
  const { data: openCount, isPending: checking } = isChange ? changeCount : accessCount;
  const hasOpen = (openCount ?? 0) > 0;

  return (
    <AlertDialog open={Boolean(policy)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText="remove" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {policy?.name || "this policy"}?</AlertDialogTitle>
          <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {checking ? (
          <Inline gap={8}>
            <Spinner />
            <span className={styles.secondary}>Checking for open requests</span>
          </Inline>
        ) : (
          <Alert
            tone={hasOpen ? "warn" : "ok"}
            title={
              hasOpen
                ? `This policy has ${openCount} open request${(openCount ?? 0) > 1 ? "s" : ""}`
                : "This policy has no open requests"
            }
          >
            {hasOpen ? "Removing it closes every open request." : "It's safe to remove."}
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={checking}
            onClick={async (event) => {
              event.preventDefault();
              if (!policy || checking) return;
              setPending(true);
              try {
                if (isChange)
                  await deleteChange.mutateAsync({ projectId: project.id, id: policy.id });
                else await deleteAccess.mutateAsync({ projectSlug: project.slug, id: policy.id });
                saved("Policy removed");
                onClose();
              } catch (error) {
                failed("Couldn't remove policy", error);
              } finally {
                setPending(false);
              }
            }}
          >
            Remove policy
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
