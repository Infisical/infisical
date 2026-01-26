import { faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
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
      <div className="mb-4 flex items-start justify-between border-b border-bunker-400 pb-4">
        <div className="flex-col">
          <h3 className="text-xl font-medium">{name}</h3>
          <h2 className="text-sm text-mineshaft-400">
            {`${getProjectTitle(type)} - `}
            {description || "Project Template"}
          </h2>
        </div>
        {!isInfisicalTemplate && (
          <div className="flex gap-2">
            <OrgPermissionCan
              I={OrgPermissionActions.Edit}
              a={OrgPermissionSubjects.ProjectTemplates}
            >
              {(isAllowed) => (
                <Button
                  isDisabled={!isAllowed}
                  leftIcon={<FontAwesomeIcon icon={faPencil} />}
                  size="xs"
                  colorSchema="secondary"
                  onClick={() => handlePopUpOpen("editDetails")}
                >
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
                  leftIcon={<FontAwesomeIcon icon={faTrash} />}
                  size="xs"
                  colorSchema="danger"
                >
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
