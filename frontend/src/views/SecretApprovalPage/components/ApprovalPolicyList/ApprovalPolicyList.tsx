import { useMemo, useState } from "react";
import {
  faCheckCircle,
  faChevronDown,
  faFileShield,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  UpgradePlanModal
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  TProjectPermission,
  useProjectPermission,
  useSubscription,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useGetSecretApprovalPolicies,
  useGetWorkspaceUsers,
  useListWorkspaceGroups,
  useUpdateAccessApprovalPolicy,
  useUpdateSecretApprovalPolicy
} from "@app/hooks/api";
import { useGetAccessApprovalPolicies } from "@app/hooks/api/accessApproval/queries";
import { PolicyType } from "@app/hooks/api/policies/enums";
import { TAccessApprovalPolicy, Workspace } from "@app/hooks/api/types";

import { AccessPolicyForm } from "./components/AccessPolicyModal";
import { ApprovalPolicyRow } from "./components/ApprovalPolicyRow";

interface IProps {
  workspaceId: string;
}

const useApprovalPolicies = (permission: TProjectPermission, currentWorkspace?: Workspace) => {
  const { data: accessPolicies, isLoading: isAccessPoliciesLoading } = useGetAccessApprovalPolicies(
    {
      projectSlug: currentWorkspace?.slug as string,
      options: {
        enabled:
          permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval) &&
          !!currentWorkspace?.slug
      }
    }
  );
  const { data: secretPolicies, isLoading: isSecretPoliciesLoading } = useGetSecretApprovalPolicies(
    {
      workspaceId: currentWorkspace?.id as string,
      options: {
        enabled:
          permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval) &&
          !!currentWorkspace?.id
      }
    }
  );

  // merge data sorted by updatedAt
  const policies = [
    ...(accessPolicies?.map((policy) => ({ ...policy, policyType: PolicyType.AccessPolicy })) ||
      []),
    ...(secretPolicies?.map((policy) => ({ ...policy, policyType: PolicyType.ChangePolicy })) || [])
  ].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return {
    policies,
    isLoading: isAccessPoliciesLoading || isSecretPoliciesLoading
  };
};

export const ApprovalPolicyList = ({ workspaceId }: IProps) => {
  const { handlePopUpToggle, handlePopUpOpen, handlePopUpClose, popUp } = usePopUp([
    "policyForm",
    "disablePolicy",
    "upgradePlan"
  ] as const);
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();

  const { data: members } = useGetWorkspaceUsers(workspaceId, true);
  const { data: groups } = useListWorkspaceGroups(currentWorkspace?.id || "");

  const { policies, isLoading: isPoliciesLoading } = useApprovalPolicies(
    permission,
    currentWorkspace
  );

  const [filterType, setFilterType] = useState<string | null>(null);

  const filteredPolicies = useMemo(() => {
    return filterType ? policies.filter((policy) => policy.policyType === filterType) : policies;
  }, [policies, filterType]);

  const { mutateAsync: updateSecretApprovalPolicy } = useUpdateSecretApprovalPolicy();
  const { mutateAsync: updateAccessApprovalPolicy } = useUpdateAccessApprovalPolicy();

  const handleDisablePolicy = async () => {
    const { id, policyType, enforcementLevel, approvers } = popUp.disablePolicy
      .data as TAccessApprovalPolicy;
    if (!currentWorkspace?.slug) return;

    try {
      if (policyType === PolicyType.ChangePolicy) {
        await updateSecretApprovalPolicy({
          workspaceId,
          id,
          disabled: true,
          enforcementLevel,
          approvers
        });
      } else {
        await updateAccessApprovalPolicy({
          projectSlug: currentWorkspace?.slug,
          id,
          disabled: true,
          enforcementLevel,
          approvers
        });
      }
      createNotification({
        type: "success",
        text: "Successfully disabled policy"
      });
      handlePopUpClose("disablePolicy");
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to disable policy"
      });
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div className="flex flex-col">
          <span className="text-xl font-semibold text-mineshaft-100">Policies</span>
          <div className="mt-2 text-sm text-bunker-300">
            Implement granular policies for access requests and secrets management.
          </div>
        </div>
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SecretApproval}
          >
            {(isAllowed) => (
              <Button
                onClick={() => {
                  if (subscription && !subscription?.secretApproval) {
                    handlePopUpOpen("upgradePlan");
                    return;
                  }
                  handlePopUpOpen("policyForm");
                }}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                isDisabled={!isAllowed}
              >
                Create Policy
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
      </div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Environment</Th>
              <Th>Secret Path</Th>
              <Th className="w-[18%]">Eligible Approvers</Th>
              <Th className="w-[18%]">Eligible Group Approvers</Th>
              <Th>Approval Required</Th>
              <Th>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button
                      variant="plain"
                      colorSchema="secondary"
                      className="text-xs font-semibold uppercase text-bunker-300"
                      rightIcon={
                        <FontAwesomeIcon icon={faChevronDown} size="sm" className="ml-2" />
                      }
                    >
                      Type
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Select a type</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => setFilterType(null)}
                      icon={!filterType && <FontAwesomeIcon icon={faCheckCircle} />}
                      iconPos="right"
                    >
                      All
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setFilterType(PolicyType.AccessPolicy)}
                      icon={
                        filterType === PolicyType.AccessPolicy && (
                          <FontAwesomeIcon icon={faCheckCircle} />
                        )
                      }
                      iconPos="right"
                    >
                      Access Policy
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setFilterType(PolicyType.ChangePolicy)}
                      icon={
                        filterType === PolicyType.ChangePolicy && (
                          <FontAwesomeIcon icon={faCheckCircle} />
                        )
                      }
                      iconPos="right"
                    >
                      Change Policy
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPoliciesLoading && (
              <TableSkeleton columns={6} innerKey="secret-policies" className="bg-mineshaft-700" />
            )}
            {!isPoliciesLoading && !filteredPolicies?.length && (
              <Tr>
                <Td colSpan={6}>
                  <EmptyState title="No policies found" icon={faFileShield} />
                </Td>
              </Tr>
            )}
            {!!currentWorkspace &&
              filteredPolicies?.map((policy) => (
                <ApprovalPolicyRow
                  policy={policy}
                  key={policy.id}
                  members={members}
                  groups={groups}
                  onEdit={() => handlePopUpOpen("policyForm", policy)}
                  onDisable={() => handlePopUpOpen("disablePolicy", policy)}
                />
              ))}
          </TBody>
        </Table>
      </TableContainer>
      <AccessPolicyForm
        projectId={currentWorkspace?.id!}
        projectSlug={currentWorkspace?.slug!}
        isOpen={popUp.policyForm.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("policyForm", isOpen)}
        members={members}
        editValues={popUp.policyForm.data as TAccessApprovalPolicy}
      />
      <DeleteActionModal
        isOpen={popUp.disablePolicy.isOpen}
        deleteKey="disable"
        title="Do you want to disable this policy?"
        subTitle="The policy will no longer be enforced and hidden from the UI."
        buttonText="Disable"
        onChange={(isOpen) => handlePopUpToggle("disablePolicy", isOpen)}
        onDeleteApproved={handleDisablePolicy}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can add secret approval policy if you switch to Infisical's Enterprise plan."
      />
    </div>
  );
};
