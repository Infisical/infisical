import { faFileShield, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
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
  useProjectPermission,
  useSubscription,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteAccessApprovalPolicy, useGetWorkspaceUsers } from "@app/hooks/api";
import { useGetAccessApprovalPolicies } from "@app/hooks/api/accessApproval/queries";
import { TAccessApprovalPolicy } from "@app/hooks/api/types";

import { AccessApprovalPolicyRow } from "./components/AccessApprovalPolicyRow";
import { AccessPolicyForm } from "./components/AccessPolicyModal";

interface IProps {
  workspaceId: string;
}

export const AccessApprovalPolicyList = ({ workspaceId }: IProps) => {
  const { handlePopUpToggle, handlePopUpOpen, handlePopUpClose, popUp } = usePopUp([
    "secretPolicyForm",
    "deletePolicy",
    "upgradePlan"
  ] as const);
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();

  const { data: members } = useGetWorkspaceUsers(workspaceId);
  const { data: policies, isLoading: isPoliciesLoading } = useGetAccessApprovalPolicies({
    projectSlug: currentWorkspace?.slug as string,
    options: {
      enabled:
        permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval) &&
        !!currentWorkspace?.slug
    }
  });

  const { mutateAsync: deleteSecretApprovalPolicy } = useDeleteAccessApprovalPolicy();

  const handleDeletePolicy = async () => {
    const { id } = popUp.deletePolicy.data as TAccessApprovalPolicy;
    if (!currentWorkspace?.slug) return;

    try {
      await deleteSecretApprovalPolicy({
        projectSlug: currentWorkspace?.slug,
        id
      });
      createNotification({
        type: "success",
        text: "Successfully deleted policy"
      });
      handlePopUpClose("deletePolicy");
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed  to delete policy"
      });
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div className="flex flex-col">
          <span className="text-xl font-semibold text-mineshaft-100">Access Request Policies</span>
          <div className="mt-2 text-sm text-bunker-300">
            Implement secret request policies for specific secrets and environments.
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
                  handlePopUpOpen("secretPolicyForm");
                }}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                isDisabled={!isAllowed}
              >
                Create policy
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
              <Th>Eligible Approvers</Th>
              <Th>Approval Required</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPoliciesLoading && (
              <TableSkeleton columns={6} innerKey="secret-policies" className="bg-mineshaft-700" />
            )}
            {!isPoliciesLoading && !policies?.length && (
              <Tr>
                <Td colSpan={6}>
                  <EmptyState title="No policies found" icon={faFileShield} />
                </Td>
              </Tr>
            )}
            {!!currentWorkspace &&
              policies?.map((policy) => (
                <AccessApprovalPolicyRow
                  projectSlug={currentWorkspace.slug}
                  policy={policy}
                  key={policy.id}
                  members={members}
                  onEdit={() => handlePopUpOpen("secretPolicyForm", policy)}
                  onDelete={() => handlePopUpOpen("deletePolicy", policy)}
                />
              ))}
          </TBody>
        </Table>
      </TableContainer>
      <AccessPolicyForm
        projectSlug={currentWorkspace?.slug!}
        isOpen={popUp.secretPolicyForm.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("secretPolicyForm", isOpen)}
        members={members}
        editValues={popUp.secretPolicyForm.data as TAccessApprovalPolicy}
      />
      <DeleteActionModal
        isOpen={popUp.deletePolicy.isOpen}
        deleteKey="remove"
        title="Do you want to remove this policy?"
        onChange={(isOpen) => handlePopUpToggle("deletePolicy", isOpen)}
        onDeleteApproved={handleDeletePolicy}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can add secret approval policy if you switch to Infisical's Enterprise  plan."
      />
    </div>
  );
};
