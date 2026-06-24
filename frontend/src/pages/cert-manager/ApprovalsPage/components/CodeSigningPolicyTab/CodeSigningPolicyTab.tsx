import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { ApprovalPolicyType, useDeleteApprovalPolicy } from "@app/hooks/api/approvalPolicies";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import { CodeSigningPoliciesTable } from "./components/CodeSigningPoliciesTable";
import { CodeSigningPolicyModal } from "./components/CodeSigningPolicyModal";

export const CodeSigningPolicyTab = () => {
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
      policyType: ApprovalPolicyType.CertCodeSigning,
      policyId
    });
    createNotification({
      text: "Successfully deleted policy",
      type: "success"
    });
    handlePopUpClose("deletePolicy");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Signing Policies
          <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.approvals.policy} />
        </CardTitle>
        <CardDescription>
          Define policies that require approval before signing operations.
        </CardDescription>
        <CardAction>
          <Button variant="project" onClick={() => handlePopUpOpen("policy")}>
            <PlusIcon />
            Create Policy
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CodeSigningPoliciesTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <CodeSigningPolicyModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deletePolicy.isOpen}
        deleteKey="delete"
        title="Are you sure you want to delete this signing policy?"
        onChange={(isOpen) => handlePopUpToggle("deletePolicy", isOpen)}
        onDeleteApproved={handleDeletePolicy}
      />
    </Card>
  );
};
