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
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useDeleteSecretApprovalPolicy,
  useGetSecretApprovalPolicies,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import { TSecretApprovalPolicy } from "@app/hooks/api/types";

import { SecretApprovalPolicyRow } from "./components/SecretApprovalPolicyRow";
import { SecretPolicyForm } from "./components/SecretPolicyForm";

type Props = {
  workspaceId: string;
};

export const SecretApprovalPolicyList = ({ workspaceId }: Props) => {
  const { handlePopUpToggle, handlePopUpOpen, handlePopUpClose, popUp } = usePopUp([
    "secretPolicyForm",
    "deletePolicy",
    "upgradePlan"
  ] as const);
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();

  const { data: members } = useGetWorkspaceUsers(workspaceId);
  const { data: policies, isLoading: isPoliciesLoading } = useGetSecretApprovalPolicies({
    workspaceId,
    options: {
      enabled: permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval)
    }
  });

  const { mutateAsync: deleteSecretApprovalPolicy } = useDeleteSecretApprovalPolicy();

  const handleDeletePolicy = async () => {
    const { id } = popUp.deletePolicy.data as TSecretApprovalPolicy;
    try {
      await deleteSecretApprovalPolicy({
        workspaceId,
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
      <div className="mb-6 flex justify-between">
        <div className="flex flex-col">
          <span className="text-xl font-semibold text-mineshaft-100">Approval Policies</span>
          <div className="mt-2 text-sm text-bunker-300">
            Implement policies to prevent unauthorized secret changes.
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
            </Tr>
          </THead>
          <TBody>
            {isPoliciesLoading && (
              <TableSkeleton columns={4} innerKey="secret-policies" className="bg-mineshaft-700" />
            )}
            {!isPoliciesLoading && !policies?.length && (
              <Tr>
                <Td colSpan={5}>
                  <EmptyState title="No policies found" icon={faFileShield} />
                </Td>
              </Tr>
            )}
            {policies?.map((policy) => (
              <SecretApprovalPolicyRow
                workspaceId={workspaceId}
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
      <SecretPolicyForm
        workspaceId={workspaceId}
        isOpen={popUp.secretPolicyForm.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("secretPolicyForm", isOpen)}
        members={members}
        editValues={popUp.secretPolicyForm.data as TSecretApprovalPolicy}
      />
      <DeleteActionModal
        isOpen={popUp.deletePolicy.isOpen}
        deleteKey="remove"
        title="Do you want to remove this polciy?"
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
