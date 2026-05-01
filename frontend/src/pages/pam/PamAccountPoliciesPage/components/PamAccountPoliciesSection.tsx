import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { EllipsisVerticalIcon, InfoIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Input } from "@app/components/v2";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountPolicyActions } from "@app/context/ProjectPermissionContext/types";
import { usePagination, usePopUp } from "@app/hooks";
import {
  TPamAccountPolicy,
  useDeletePamAccountPolicy,
  useListPamAccountPolicies
} from "@app/hooks/api/pam";

import { PolicySheet } from "./PolicySheet";

type Props = {
  projectId: string;
};

export const PamAccountPoliciesSection = ({ projectId }: Props) => {
  const { search, debouncedSearch, setSearch } = usePagination("", { initPerPage: 20 });

  const { data: policies, isPending } = useListPamAccountPolicies(projectId, debouncedSearch);
  const deletePolicy = useDeletePamAccountPolicy();

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "createPolicy",
    "editPolicy",
    "deletePolicy"
  ] as const);

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted">
                  Loading account policies...
                </TableCell>
              </TableRow>
            )}
            {!isPending && (!policies || policies.length === 0) && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Empty className="border-0 bg-transparent py-8 shadow-none">
                    <EmptyHeader>
                      <EmptyTitle>
                        {search ? "No account policies match search" : "No account policies"}
                      </EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
            {!isPending &&
              policies?.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell>
                    <div className="flex items-center">
                      <span className="font-medium">{policy.name}</span>
                      {policy.description && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon className="ml-1.5 size-3.5 text-muted" />
                          </TooltipTrigger>
                          <TooltipContent>{policy.description}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={policy.isActive ? "success" : "neutral"}>
                      {policy.isActive ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted">
                    {format(new Date(policy.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="xs">
                          <EllipsisVerticalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent sideOffset={2} align="end">
                        <ProjectPermissionCan
                          I={ProjectPermissionPamAccountPolicyActions.Edit}
                          a={ProjectPermissionSub.PamAccountPolicies}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              isDisabled={!isAllowed}
                              onSelect={() => handlePopUpOpen("editPolicy", policy)}
                            >
                              <PencilIcon className="mr-2 size-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionPamAccountPolicyActions.Delete}
                          a={ProjectPermissionSub.PamAccountPolicies}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              isDisabled={!isAllowed}
                              variant="danger"
                              onSelect={() => handlePopUpOpen("deletePolicy", policy)}
                            >
                              <TrashIcon className="mr-2 size-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
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
