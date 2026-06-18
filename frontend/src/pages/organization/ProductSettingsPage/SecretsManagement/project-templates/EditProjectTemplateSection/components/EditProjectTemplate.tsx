import { Pencil, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import { Button } from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectTemplate, useDeleteProjectTemplate } from "@app/hooks/api/projectTemplates";

import { ProjectTemplateDetailsModal } from "../../ProjectTemplateDetailsModal";
import { ProjectTemplateEnvironmentsForm } from "./ProjectTemplateEnvironmentsForm";
import { ProjectTemplateGroupsSection } from "./ProjectTemplateGroupsSection";
import { ProjectTemplateIdentitiesSection } from "./ProjectTemplateIdentitiesSection";
import { ProjectTemplateRolesSection } from "./ProjectTemplateRolesSection";
import { ProjectTemplateUsersSection } from "./ProjectTemplateUsersSection";

type Props = {
  projectTemplate: TProjectTemplate;
  onBack: () => void;
  isInfisicalTemplate: boolean;
};

export const EditProjectTemplate = ({ isInfisicalTemplate, projectTemplate, onBack }: Props) => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeTemplate",
    "editDetails"
  ] as const);

  const { id: templateId, name, description, type } = projectTemplate;

  const deleteProjectTemplate = useDeleteProjectTemplate();

  const handleRemoveTemplate = async () => {
    await deleteProjectTemplate.mutateAsync({
      templateId
    });
    createNotification({
      text: "Successfully removed project template",
      type: "success"
    });
    onBack();
    handlePopUpClose("removeTemplate");
  };

  return (
    <>
      <div className="mb-9 flex items-start justify-between gap-4">
        <div className="flex-col">
          <h3 className="text-2xl font-semibold tracking-normal">{name}</h3>
          <h2 className="mt-2 text-base text-mineshaft-300">
            {getProjectTitle(type)}
            <span className="px-2 text-mineshaft-500">•</span>
            {description || "Project Template"}
          </h2>
        </div>
        {!isInfisicalTemplate && (
          <div className="flex shrink-0 gap-3 pt-1">
            <OrgPermissionCan
              I={OrgPermissionActions.Edit}
              a={OrgPermissionSubjects.ProjectTemplates}
            >
              {(isAllowed) => (
                <Button
                  isDisabled={!isAllowed}
                  size="lg"
                  variant="outline"
                  onClick={() => handlePopUpOpen("editDetails")}
                >
                  <Pencil className="size-4" />
                  Edit Details
                </Button>
              )}
            </OrgPermissionCan>
            <OrgPermissionCan
              I={OrgPermissionActions.Delete}
              a={OrgPermissionSubjects.ProjectTemplates}
            >
              {(isAllowed) => (
                <Button
                  isDisabled={!isAllowed}
                  onClick={() => {
                    handlePopUpOpen("removeTemplate");
                  }}
                  size="lg"
                  variant="danger"
                  className="text-red-200"
                >
                  <Trash2 className="size-4" />
                  Delete Template
                </Button>
              )}
            </OrgPermissionCan>
          </div>
        )}
      </div>
      {type === ProjectType.SecretManager && (
        <ProjectTemplateEnvironmentsForm
          isInfisicalTemplate={isInfisicalTemplate}
          projectTemplate={projectTemplate}
        />
      )}
      <ProjectTemplateRolesSection
        isInfisicalTemplate={isInfisicalTemplate}
        projectTemplate={projectTemplate}
      />
      {!isInfisicalTemplate && (
        <>
          <ProjectTemplateUsersSection projectTemplate={projectTemplate} />
          <ProjectTemplateGroupsSection projectTemplate={projectTemplate} />
          <ProjectTemplateIdentitiesSection projectTemplate={projectTemplate} />
        </>
      )}
      <ProjectTemplateDetailsModal
        isOpen={popUp.editDetails.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editDetails", isOpen)}
        projectTemplate={projectTemplate}
      />
      <DeleteActionModal
        isOpen={popUp.removeTemplate.isOpen}
        title={`Are you sure you want to delete ${projectTemplate.name}?`}
        deleteKey="confirm"
        onChange={(isOpen) => handlePopUpToggle("removeTemplate", isOpen)}
        onDeleteApproved={handleRemoveTemplate}
      />
    </>
  );
};
