import { CheckIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Alert, AlertDescription, AlertTitle, ConfirmationAlertDialog } from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useDeleteAccessApprovalPolicy,
  useDeleteSecretApprovalPolicy,
  useGetAccessRequestsCount,
  useGetSecretApprovalRequestCount
} from "@app/hooks/api";
import { PolicyType } from "@app/hooks/api/policies/enums";

type Props = {
  policyId: string;
  policyType: PolicyType;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const RemoveApprovalPolicyModal = ({
  policyId,
  policyType,
  isOpen,
  onOpenChange
}: Props) => {
  const deleteSecretApprovalPolicy = useDeleteSecretApprovalPolicy();
  const deleteAccessApprovalPolicy = useDeleteAccessApprovalPolicy();

  const { currentProject } = useProject();

  const isDeleting = deleteSecretApprovalPolicy.isPending || deleteAccessApprovalPolicy.isPending;

  const deleteSecretApprovalData = useGetSecretApprovalRequestCount({
    policyId,
    projectId: currentProject.id,
    options: {
      enabled: Boolean(policyId) && policyType === PolicyType.ChangePolicy
    }
  });

  const deleteAccessApprovalData = useGetAccessRequestsCount({
    projectSlug: currentProject.slug,
    policyId,
    options: {
      enabled: Boolean(policyId) && policyType === PolicyType.AccessPolicy
    }
  });

  let openCount: number | undefined;
  let isCheckingRequests: boolean;
  if (policyType === PolicyType.ChangePolicy) {
    openCount = deleteSecretApprovalData.data?.open;
    isCheckingRequests = deleteSecretApprovalData.isPending;
  } else {
    openCount = deleteAccessApprovalData.data?.pendingCount;
    isCheckingRequests = deleteAccessApprovalData.isPending;
  }

  const hasOpenRequests = (openCount ?? 0) > 0;

  const handleDeletePolicy = async () => {
    if (isCheckingRequests) return;

    if (policyType === PolicyType.ChangePolicy) {
      await deleteSecretApprovalPolicy.mutateAsync({
        projectId: currentProject.id,
        id: policyId
      });
    } else {
      await deleteAccessApprovalPolicy.mutateAsync({
        projectSlug: currentProject.slug,
        id: policyId
      });
    }
    createNotification({
      type: "success",
      text: "Successfully deleted policy"
    });
    onOpenChange(false);
  };

  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Remove this policy?"
      description={
        <div className="flex flex-col gap-3">
          <p>Removing this policy cannot be undone.</p>
          {isCheckingRequests ? (
            <div className="flex w-full items-center gap-2">
              <LoaderCircleIcon className="size-4 animate-spin text-muted" />
              <span className="text-sm text-muted">Checking for open requests...</span>
            </div>
          ) : (
            <Alert variant={hasOpenRequests ? "warning" : "success"}>
              {hasOpenRequests ? <TriangleAlertIcon /> : <CheckIcon />}
              <AlertTitle>
                {hasOpenRequests
                  ? `This policy has ${openCount} open request${(openCount ?? 0) > 1 ? "s" : ""}`
                  : "This policy has no open requests"}
              </AlertTitle>
              <AlertDescription>
                {hasOpenRequests
                  ? "Removing this policy will close all open requests."
                  : "This policy is safe to remove."}
              </AlertDescription>
            </Alert>
          )}
        </div>
      }
      confirmKey="remove"
      confirmLabel="Remove"
      isPending={isDeleting}
      onConfirm={handleDeletePolicy}
    />
  );
};
