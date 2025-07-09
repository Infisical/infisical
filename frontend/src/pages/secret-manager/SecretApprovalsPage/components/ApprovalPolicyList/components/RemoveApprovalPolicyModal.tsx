import { faCheck, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, Spinner } from "@app/components/v2";
import { useWorkspace } from "@app/context";
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
  const { mutateAsync: deleteSecretApprovalPolicy } = useDeleteSecretApprovalPolicy();
  const { mutateAsync: deleteAccessApprovalPolicy } = useDeleteAccessApprovalPolicy();

  const { currentWorkspace } = useWorkspace();

  const handleDeletePolicy = async () => {
    try {
      if (policyType === PolicyType.ChangePolicy) {
        await deleteSecretApprovalPolicy({
          workspaceId: currentWorkspace.id,
          id: policyId
        });
      } else {
        await deleteAccessApprovalPolicy({
          projectSlug: currentWorkspace.slug,
          id: policyId
        });
      }
      createNotification({
        type: "success",
        text: "Successfully deleted policy"
      });
      onOpenChange(false);
    } catch {
      createNotification({
        type: "error",
        text: "Failed to delete policy"
      });
    }
  };

  const deleteSecretApprovalData = useGetSecretApprovalRequestCount({
    policyId,
    workspaceId: currentWorkspace.id,
    options: {
      enabled: Boolean(policyId) && policyType === PolicyType.ChangePolicy
    }
  });

  const deleteAccessApprovalData = useGetAccessRequestsCount({
    projectSlug: currentWorkspace.slug,
    policyId,
    options: {
      enabled: Boolean(policyId) && policyType === PolicyType.AccessPolicy
    }
  });

  let openCount: number | undefined;
  let isPending: boolean;
  if (policyType === PolicyType.ChangePolicy) {
    openCount = deleteSecretApprovalData.data?.open;
    isPending = deleteSecretApprovalData.isPending;
  } else {
    openCount = deleteAccessApprovalData.data?.pendingCount;
    isPending = deleteAccessApprovalData.isPending;
  }

  return (
    <DeleteActionModal
      isOpen={isOpen}
      deleteKey="remove"
      title="Do you want to remove this policy?"
      onChange={onOpenChange}
      onDeleteApproved={handleDeletePolicy}
      isDisabled={isPending}
    >
      {isPending ? (
        <div className="mt-4 flex w-full items-center gap-2 p-2">
          <Spinner size="xs" className="text-mineshaft-600" />
          <span className="text-sm text-mineshaft-400">Checking for open requests...</span>
        </div>
      ) : (
        <div
          className={twMerge(
            "mt-4 flex w-full items-start gap-2 rounded border p-2 text-sm",
            (openCount ?? 0) > 0
              ? "border-yellow/20 bg-yellow/10 text-yellow"
              : "border-green/20 bg-green/10 text-green"
          )}
        >
          {(openCount ?? 0) > 0 ? (
            <>
              <FontAwesomeIcon className="mt-1" icon={faWarning} />
              <div className="flex flex-col">
                <span>
                  This policy has {openCount} open request
                  {(openCount ?? 0) > 1 ? "s" : ""}
                </span>
                <p className="text-xs text-mineshaft-200">
                  Removing this policy will close all open requests.
                </p>
              </div>
            </>
          ) : (
            <>
              <FontAwesomeIcon className="mt-1" icon={faCheck} />
              <div className="flex flex-col">
                <span>This policy has no open requests</span>
                <p className="text-xs text-mineshaft-200">This policy is safe to remove.</p>
              </div>
            </>
          )}
        </div>
      )}
    </DeleteActionModal>
  );
};
