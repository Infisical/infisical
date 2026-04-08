import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { EllipsisVerticalIcon, PlusIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Input } from "@app/components/v2";
import {
  Button,
  Switch,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountPolicyActions } from "@app/context/ProjectPermissionContext/types";
import { usePagination, usePopUp } from "@app/hooks";
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
  const { search, debouncedSearch, setSearch } = usePagination("", { initPerPage: 20 });

  const { data: policies, isPending } = useListPamAccountPolicies(projectId, debouncedSearch);
  const updatePolicy = useUpdatePamAccountPolicy();
  const deletePolicy = useDeletePamAccountPolicy();

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
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
      handlePopUpClose("deletePolicy");
    } catch {
      createNotification({
        text: "Failed to delete policy",
        type: "error"
      });
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search account policies..."
          className="h-full flex-1"
          containerClassName="h-9"
        />
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountPolicyActions.Create}
          a={ProjectPermissionSub.PamAccountPolicies}
        >
          {(isAllowed) => (
            <Button
              variant="project"
              onClick={() => handlePopUpOpen("createPolicy")}
              isDisabled={!isAllowed}
            >
              <PlusIcon />
              Create Policy
            </Button>
          )}
        </ProjectPermissionCan>
      </div>

      <div className="mt-4">
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Name</UnstableTableHead>
              <UnstableTableHead>Description</UnstableTableHead>
              <UnstableTableHead>Active</UnstableTableHead>
              <UnstableTableHead>Created At</UnstableTableHead>
              <UnstableTableHead className="w-5" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {isPending && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={5} className="text-center text-muted">
                  Loading account policies...
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {!isPending && (!policies || policies.length === 0) && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={5}>
                  <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                    <UnstableEmptyHeader>
                      <UnstableEmptyTitle>
                        {search ? "No account policies match search" : "No account policies"}
                      </UnstableEmptyTitle>
                    </UnstableEmptyHeader>
                  </UnstableEmpty>
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {!isPending &&
              policies?.map((policy) => (
                <UnstableTableRow key={policy.id}>
                  <UnstableTableCell className="font-medium">{policy.name}</UnstableTableCell>
                  <UnstableTableCell className="max-w-xs truncate text-muted">
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
                  <UnstableTableCell className="text-muted">
                    {format(new Date(policy.createdAt), "MMM d, yyyy")}
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <UnstableDropdownMenu>
                      <UnstableDropdownMenuTrigger asChild>
                        <UnstableIconButton variant="ghost" size="xs">
                          <EllipsisVerticalIcon />
                        </UnstableIconButton>
                      </UnstableDropdownMenuTrigger>
                      <UnstableDropdownMenuContent sideOffset={2} align="end">
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
                              variant="danger"
                              onSelect={() => handlePopUpOpen("deletePolicy", policy)}
                            >
                              <TrashIcon className="size-4" />
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
      </div>

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
        title={`Delete policy "${(popUp.deletePolicy.data as TPamAccountPolicy | undefined)?.name}"?`}
        subTitle="This will permanently remove this policy. Accounts using it will have their policy detached."
        onChange={(isOpen) => handlePopUpToggle("deletePolicy", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDelete}
      />
    </div>
  );
};
