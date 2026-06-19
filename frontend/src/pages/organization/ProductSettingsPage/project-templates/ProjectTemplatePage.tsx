import { Helmet } from "react-helmet";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import { Button } from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  InfisicalProjectTemplate,
  useDeleteProjectTemplate,
  useGetProjectTemplateById,
  useListProjectTemplates
} from "@app/hooks/api/projectTemplates";

import { EditProjectTemplateSection } from "./EditProjectTemplateSection";
import { ProjectTemplateDetailsModal } from "./ProjectTemplateDetailsModal";

type Props = {
  templateId: string;
  projectType: ProjectType;
  onBack: () => void;
};

export const ProjectTemplatePage = ({ templateId, projectType, onBack }: Props) => {
  const { data: projectTemplate } = useGetProjectTemplateById(templateId);
  const { data: projectTemplates = [] } = useListProjectTemplates();
  const deleteProjectTemplate = useDeleteProjectTemplate();
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeTemplate",
    "editDetails"
  ] as const);

  const templateName =
    projectTemplate?.name ?? projectTemplates.find((t) => t.id === templateId)?.name;

  const isInfisicalTemplate = templateName === InfisicalProjectTemplate.Default;

  const handleRemoveTemplate = async () => {
    await deleteProjectTemplate.mutateAsync({ templateId });
    createNotification({
      text: "Successfully removed project template",
      type: "success"
    });
    onBack();
    handlePopUpClose("removeTemplate");
  };

  return (
    <>
      <Helmet>
        <title>Project Template | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="h-full">
        <div className="mx-auto h-full w-full max-w-8xl bg-bunker-800 text-white">
          <Button
            variant="ghost"
            type="button"
            onClick={onBack}
            className="mb-2 px-0 text-mineshaft-300 hover:bg-transparent hover:text-mineshaft-100"
          >
            <ChevronLeft className="size-4" />
            Back to Templates
          </Button>
          <PageHeader
            scope={projectType}
            title={templateName ?? "Project Template"}
            description={
              <>
                {getProjectTitle(projectType)}
                {projectTemplate?.description && (
                  <>
                    <span className="px-2 text-mineshaft-500">&bull;</span>
                    {projectTemplate.description}
                  </>
                )}
              </>
            }
          >
            {!isInfisicalTemplate && (
              <>
                <OrgPermissionCan
                  I={OrgPermissionActions.Edit}
                  a={OrgPermissionSubjects.ProjectTemplates}
                >
                  {(isAllowed) => (
                    <Button
                      isDisabled={!isAllowed}
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
                      onClick={() => handlePopUpOpen("removeTemplate")}
                      variant="danger"
                    >
                      <Trash2 className="size-4" />
                      Delete Template
                    </Button>
                  )}
                </OrgPermissionCan>
              </>
            )}
          </PageHeader>
          <div className="pb-8">
            <EditProjectTemplateSection templateId={templateId} projectType={projectType} />
          </div>
        </div>
      </div>
      {projectTemplate && (
        <>
          <ProjectTemplateDetailsModal
            projectType={projectType}
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
      )}
    </>
  );
};
