import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import { useProject, useProjectPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { ApprovalPolicyType, useDeleteApprovalPolicy } from "@app/hooks/api/approvalPolicies";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { PoliciesTable } from "./components/PoliciesTable";
import { PolicyModal } from "./components/PolicyModal";

export const PolicyTab = () => {
  const { currentProject } = useProject();
  const { memberships } = useProjectPermission();

  const isAdmin = memberships.some((m) =>
    m.roles.some((r) => r.role === ProjectMembershipRole.Admin)
  );

  const { mutateAsync: deleteApprovalPolicy } = useDeleteApprovalPolicy();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "policy",
    "deletePolicy"
  ] as const);

  if (!isAdmin) {
    return <PermissionDeniedBanner />;
  }

  const handleDeletePolicy = async () => {
    const policyId = (popUp?.deletePolicy?.data as { policyId: string })?.policyId;
    if (!currentProject?.id) return;
    if (!policyId) return;

    await deleteApprovalPolicy({
      policyType: ApprovalPolicyType.CertRequest,
      policyId
    });
    createNotification({
      text: "Successfully deleted policy",
      type: "success"
    });
    handlePopUpClose("deletePolicy");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-start">
        <div className="flex-1">
          <div className="flex items-center gap-x-2">
            <p className="text-xl font-medium text-mineshaft-100">Certificate Approval Policies</p>
          </div>
          <p className="text-sm text-bunker-300">
            Existing project-level policies remain editable. Create new approval policies inside a
            Cert Manager Application.
          </p>
        </div>
      </div>

      <PoliciesTable handlePopUpOpen={handlePopUpOpen} />
      <PolicyModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deletePolicy.isOpen}
        deleteKey="delete"
        title="Are you sure you want to delete this policy?"
        onChange={(isOpen) => handlePopUpToggle("deletePolicy", isOpen)}
        onDeleteApproved={handleDeletePolicy}
      />
    </div>
  );
};
