import { useState } from "react";
import { format } from "date-fns";
import { EllipsisVertical, Plus } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  Skeleton,
  Switch,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountPolicyActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  TPamAccountPolicy,
  useDeletePamAccountPolicy,
  useListPamAccountPolicies,
  useUpdatePamAccountPolicy
} from "@app/hooks/api/pam";

import { PolicySheet } from "./PolicySheet";

type Props = {
  projectId: string;
};

export const PamAccountPoliciesSection = ({ projectId }: Props) => {
  const [search] = useState<string | undefined>();
  const { data: policies, isPending } = useListPamAccountPolicies(projectId, search);
  const updatePolicy = useUpdatePamAccountPolicy();
  const deletePolicy = useDeletePamAccountPolicy();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "createPolicy",
    "editPolicy",
    "deletePolicy"
  ] as const);

  const handleToggleActive = async (policy: TPamAccountPolicy) => {
    try {
      await updatePolicy.mutateAsync({
        policyId: policy.id,
        isActive: !policy.isActive
      });
      createNotification({
        text: `Policy ${policy.isActive ? "disabled" : "enabled"} successfully`,
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to update policy",
        type: "error"
      });
    }
  };

  const handleDelete = async () => {
    const policy = popUp.deletePolicy.data as TPamAccountPolicy | undefined;
    if (!policy) return;

    try {
      await deletePolicy.mutateAsync({ policyId: policy.id });
      createNotification({
        text: "Policy deleted successfully",
        type: "success"
      });
      handlePopUpToggle("deletePolicy", false);
    } catch {
      createNotification({
        text: "Failed to delete policy",
        type: "error"
      });
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div />
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountPolicyActions.Create}
          a={ProjectPermissionSub.PamAccountPolicies}
        >
          {(isAllowed) => (
            <Button disabled={!isAllowed} onClick={() => handlePopUpOpen("createPolicy")} size="xs">
              <Plus className="mr-1 h-4 w-4" />
              Create Policy
            </Button>
          )}
        </ProjectPermissionCan>
      </div>

      {isPending && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}
      {!isPending && policies && policies.length > 0 && (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Name</UnstableTableHead>
              <UnstableTableHead>Description</UnstableTableHead>
              <UnstableTableHead>Active</UnstableTableHead>
              <UnstableTableHead>Created At</UnstableTableHead>
              <UnstableTableHead className="w-12" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {policies.map((policy) => (
              <UnstableTableRow key={policy.id}>
                <UnstableTableCell className="font-medium">{policy.name}</UnstableTableCell>
                <UnstableTableCell className="max-w-xs truncate text-mineshaft-300">
                  {policy.description || "—"}
                </UnstableTableCell>
                <UnstableTableCell>
                  <ProjectPermissionCan
                    I={ProjectPermissionPamAccountPolicyActions.Edit}
                    a={ProjectPermissionSub.PamAccountPolicies}
                  >
                    {(isAllowed) => (
                      <Switch
                        variant="project"
                        checked={policy.isActive}
                        onCheckedChange={() => handleToggleActive(policy)}
                        disabled={!isAllowed}
                      />
                    )}
                  </ProjectPermissionCan>
                </UnstableTableCell>
                <UnstableTableCell className="text-mineshaft-300">
                  {format(new Date(policy.createdAt), "MMM d, yyyy")}
                </UnstableTableCell>
                <UnstableTableCell>
                  <UnstableDropdownMenu>
                    <UnstableDropdownMenuTrigger asChild>
                      <Button variant="ghost" size="xs" className="text-mineshaft-300">
                        <EllipsisVertical className="h-4 w-4" />
                      </Button>
                    </UnstableDropdownMenuTrigger>
                    <UnstableDropdownMenuContent align="end">
                      <ProjectPermissionCan
                        I={ProjectPermissionPamAccountPolicyActions.Edit}
                        a={ProjectPermissionSub.PamAccountPolicies}
                      >
                        {(isAllowed) => (
                          <UnstableDropdownMenuItem
                            isDisabled={!isAllowed}
                            onSelect={() => handlePopUpOpen("editPolicy", policy)}
                          >
                            Edit
                          </UnstableDropdownMenuItem>
                        )}
                      </ProjectPermissionCan>
                      <ProjectPermissionCan
                        I={ProjectPermissionPamAccountPolicyActions.Delete}
                        a={ProjectPermissionSub.PamAccountPolicies}
                      >
                        {(isAllowed) => (
                          <UnstableDropdownMenuItem
                            isDisabled={!isAllowed}
                            onSelect={() => handlePopUpOpen("deletePolicy", policy)}
                          >
                            Delete
                          </UnstableDropdownMenuItem>
                        )}
                      </ProjectPermissionCan>
                    </UnstableDropdownMenuContent>
                  </UnstableDropdownMenu>
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
          </UnstableTableBody>
        </UnstableTable>
      )}
      {!isPending && (!policies || policies.length === 0) && (
        <UnstableEmpty>
          <p className="text-sm text-mineshaft-300">No account policies configured yet.</p>
        </UnstableEmpty>
      )}

      <PolicySheet
        isOpen={popUp.createPolicy.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createPolicy", isOpen)}
        projectId={projectId}
      />

      <PolicySheet
        isOpen={popUp.editPolicy.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editPolicy", isOpen)}
        projectId={projectId}
        policy={popUp.editPolicy.data as TPamAccountPolicy | undefined}
      />

      <DeleteActionModal
        isOpen={popUp.deletePolicy.isOpen}
        onChange={(isOpen) => handlePopUpToggle("deletePolicy", isOpen)}
        title={`Are you sure you want to delete ${(popUp.deletePolicy.data as TPamAccountPolicy | undefined)?.name ?? "this policy"}?`}
        deleteKey={(popUp.deletePolicy.data as TPamAccountPolicy | undefined)?.name ?? ""}
        onDeleteApproved={handleDelete}
      />
    </div>
  );
};
