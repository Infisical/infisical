import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useProjectPermission } from "@app/context";
import {
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useDeleteCertificateTemplateV2WithPolicies } from "@app/hooks/api/certificateTemplates/mutations";
import { TCertificateTemplateV2WithPolicies } from "@app/hooks/api/certificateTemplates/types";

import { CreateTemplateModal } from "./CreateTemplateModal";
import { TemplateList } from "./TemplateList";

export const CertificateTemplatesV2Tab = () => {
  const { permission } = useProjectPermission();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<TCertificateTemplateV2WithPolicies | null>(null);

  const deleteTemplateV2 = useDeleteCertificateTemplateV2WithPolicies();

  const canCreateTemplate = permission.can(
    ProjectPermissionPkiTemplateActions.Create,
    ProjectPermissionSub.CertificateTemplates
  );

  const handleCreateTemplate = () => {
    setIsCreateModalOpen(true);
  };

  const handleEditTemplate = (template: TCertificateTemplateV2WithPolicies) => {
    setSelectedTemplate(template);
    setIsEditModalOpen(true);
  };

  const handleDeleteTemplate = (template: TCertificateTemplateV2WithPolicies) => {
    setSelectedTemplate(template);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTemplate) return;

    try {
      await deleteTemplateV2.mutateAsync({
        templateId: selectedTemplate.id
      });
      setIsDeleteModalOpen(false);
      setSelectedTemplate(null);
      createNotification({
        text: `Certificate template "${selectedTemplate.name}" deleted successfully`,
        type: "success"
      });
    } catch (error) {
      console.error("Failed to delete template:", error);
      createNotification({
        text: "Failed to delete certificate template",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-mineshaft-100">Certificate Templates</h2>
          <p className="text-sm text-bunker-300">
            Define certificate policies, validation rules, and attribute constraints for certificate
            issuance
          </p>
        </div>

        {canCreateTemplate && (
          <Button
            colorSchema="primary"
            type="button"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={handleCreateTemplate}
          >
            Create Template
          </Button>
        )}
      </div>

      <TemplateList onEditTemplate={handleEditTemplate} onDeleteTemplate={handleDeleteTemplate} />

      <CreateTemplateModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

      {selectedTemplate && (
        <>
          <CreateTemplateModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setSelectedTemplate(null);
            }}
            template={selectedTemplate}
            mode="edit"
          />

          <DeleteActionModal
            isOpen={isDeleteModalOpen}
            title={`Delete Certificate Template ${selectedTemplate.name}?`}
            onChange={(isOpen) => {
              setIsDeleteModalOpen(isOpen);
              if (!isOpen) setSelectedTemplate(null);
            }}
            deleteKey={selectedTemplate.name}
            onDeleteApproved={handleDeleteConfirm}
          />
        </>
      )}
    </div>
  );
};
