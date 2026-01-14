import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useDeleteCertificatePolicy } from "@app/hooks/api/certificatePolicies";
import { type TCertificatePolicy } from "@app/hooks/api/certificatePolicies";

import { CreatePolicyModal } from "./CreatePolicyModal";
import { PolicyList } from "./PolicyList";

export const CertificatePoliciesTab = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<TCertificatePolicy | null>(null);

  const deletePolicy = useDeleteCertificatePolicy();

  const handleCreatePolicy = () => {
    setIsCreateModalOpen(true);
  };

  const handleEditPolicy = (policy: TCertificatePolicy) => {
    setSelectedPolicy(policy);
    setIsEditModalOpen(true);
  };

  const handleDeletePolicy = (policy: TCertificatePolicy) => {
    setSelectedPolicy(policy);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPolicy) return;

    await deletePolicy.mutateAsync({
      policyId: selectedPolicy.id
    });
    setIsDeleteModalOpen(false);
    setSelectedPolicy(null);
    createNotification({
      text: `Certificate policy "${selectedPolicy.name}" deleted successfully`,
      type: "success"
    });
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-x-2">
            <h2 className="text-xl font-semibold text-mineshaft-100">Certificate Policies</h2>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/certificates/policies" />
          </div>
          <p className="text-sm text-bunker-300">
            Define certificate policies, validation rules, and attribute constraints for certificate
            issuance
          </p>
        </div>

        <ProjectPermissionCan
          I={ProjectPermissionCertificatePolicyActions.Create}
          a={ProjectPermissionSub.CertificatePolicies}
        >
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              colorSchema="primary"
              type="button"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={handleCreatePolicy}
            >
              Create Policy
            </Button>
          )}
        </ProjectPermissionCan>
      </div>

      <PolicyList onEditPolicy={handleEditPolicy} onDeletePolicy={handleDeletePolicy} />

      <CreatePolicyModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
        }}
      />

      {selectedPolicy && (
        <>
          <CreatePolicyModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setSelectedPolicy(null);
            }}
            policy={selectedPolicy}
            mode="edit"
          />

          <DeleteActionModal
            isOpen={isDeleteModalOpen}
            title={`Delete Certificate Policy ${selectedPolicy.name}?`}
            onChange={(isOpen) => {
              setIsDeleteModalOpen(isOpen);
              if (!isOpen) setSelectedPolicy(null);
            }}
            deleteKey={selectedPolicy.name}
            onDeleteApproved={handleDeleteConfirm}
          />
        </>
      )}
    </div>
  );
};
