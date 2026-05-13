import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
    <Card>
      <CardHeader>
        <CardTitle>
          Certificate Policies
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/certificates/policies" />
        </CardTitle>
        <CardDescription>
          The rules applied when certificates are issued. Policies set things like which algorithms
          are allowed, how the certificate can be used, how long it stays valid, and what identity
          information it includes.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionCertificatePolicyActions.Create}
            a={ProjectPermissionSub.CertificatePolicies}
          >
            {(isAllowed) => (
              <Button
                variant="project"
                isDisabled={!isAllowed}
                onClick={() => setIsCreateModalOpen(true)}
              >
                <PlusIcon />
                Create Policy
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <PolicyList onEditPolicy={handleEditPolicy} onDeletePolicy={handleDeletePolicy} />
      </CardContent>

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
    </Card>
  );
};
