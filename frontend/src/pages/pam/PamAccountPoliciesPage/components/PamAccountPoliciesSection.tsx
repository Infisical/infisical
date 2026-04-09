import { format } from "date-fns";
import {
  EllipsisVerticalIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
  Button,
  DocumentationLinkBadge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
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
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            Account Policies
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pam/product-reference/account-policies" />
          </UnstableCardTitle>
          <UnstableCardDescription>Define behavioral rules for accounts</UnstableCardDescription>
          <UnstableCardAction>
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
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          <div className="mb-4">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search account policies..."
              />
            </InputGroup>
          </div>
          {!isPending && (!policies || policies.length === 0) ? (
            <UnstableEmpty className="border">
              <UnstableEmptyHeader>
                <UnstableEmptyTitle>
                  {search ? "No account policies match search" : "No account policies"}
                </UnstableEmptyTitle>
                {!search && (
                  <UnstableEmptyDescription>
                    Create a policy to enforce behavioral rules on PAM accounts
                  </UnstableEmptyDescription>
                )}
              </UnstableEmptyHeader>
            </UnstableEmpty>
          ) : (
            <UnstableTable>
              <UnstableTableHeader>
                <UnstableTableRow>
                  <UnstableTableHead>Name</UnstableTableHead>
                  <UnstableTableHead>Status</UnstableTableHead>
                  <UnstableTableHead>Created</UnstableTableHead>
                  <UnstableTableHead className="w-5" />
                </UnstableTableRow>
              </UnstableTableHeader>
              <UnstableTableBody>
                {isPending && (
                  <UnstableTableRow>
                    <UnstableTableCell colSpan={4} className="text-center text-muted">
                      Loading account policies...
                    </UnstableTableCell>
                  </UnstableTableRow>
                )}
                {!isPending &&
                  policies?.map((policy) => (
                    <UnstableTableRow key={policy.id}>
                      <UnstableTableCell>
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
                      </UnstableTableCell>
                      <UnstableTableCell>
                        <Badge variant={policy.isActive ? "success" : "neutral"}>
                          {policy.isActive ? "Enabled" : "Disabled"}
                        </Badge>
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
                                  <PencilIcon className="mr-2 size-4" />
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
                                  <TrashIcon className="mr-2 size-4" />
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
        </UnstableCardContent>
      </UnstableCard>

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
