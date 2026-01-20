import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useProject } from "@app/context";
import { usePopUp } from "@app/hooks";
import { ApprovalPolicyType, useDeleteApprovalPolicy } from "@app/hooks/api/approvalPolicies";

import { PoliciesTable } from "./components/PoliciesTable";
import { PolicyModal } from "./components/PolicyModal";

export const PolicyTab = () => {
  const { currentProject } = useProject();

  const { mutateAsync: deleteApprovalPolicy } = useDeleteApprovalPolicy();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "policy",
    "deletePolicy"
  ] as const);

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
      <div className="mb-4 flex items-center">
        <div className="flex-1">
          <div className="flex items-center gap-x-2">
            <p className="text-xl font-medium text-mineshaft-100">Certificate Approval Policies</p>
          </div>
          <p className="text-sm text-bunker-300">
            Define policies that require approval before certificates can be issued from specific
            profiles
          </p>
        </div>

        <Button
          variant="outline_bg"
          type="submit"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => handlePopUpOpen("policy")}
        >
          Create Policy
        </Button>
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
