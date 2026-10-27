import { ChevronLeft, Pencil, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, ConfirmationAlertDialog } from "@app/components/v3";
import { PageHeader } from "@app/components/v3/platform";
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

  const matchingProjectTemplate =
    projectTemplate?.type === projectType ? projectTemplate : undefined;
  const templateName =
    matchingProjectTemplate?.name ??
    projectTemplates.find((t) => t.id === templateId && t.type === projectType)?.name;

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
      <link rel="icon" href="/infisical.ico" />
      <div>
        <div className="mx-auto w-full max-w-8xl bg-page text-foreground-inverse">
          <Button
            variant="ghost"
            type="button"
            onClick={onBack}
            className="mb-2 px-0 text-label hover:bg-transparent hover:text-foreground"
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
                {matchingProjectTemplate?.description && (
                  <>
                    <span className="px-2 text-surface-selected">&bull;</span>
                    {matchingProjectTemplate.description}
                  </>
                )}
              </>
            }
          >
            {matchingProjectTemplate && !isInfisicalTemplate && (
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
      {matchingProjectTemplate && (
        <>
          <ProjectTemplateDetailsModal
            projectType={projectType}
            isOpen={popUp.editDetails.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("editDetails", isOpen)}
            projectTemplate={matchingProjectTemplate}
          />
          <ConfirmationAlertDialog
            isOpen={popUp.removeTemplate.isOpen}
            title={`Are you sure you want to delete ${matchingProjectTemplate.name}?`}
            confirmKey="confirm"
            description="This action is irreversible."
            onOpenChange={(isOpen) => handlePopUpToggle("removeTemplate", isOpen)}
            onConfirm={handleRemoveTemplate}
          />
        </>
      )}
    </>
  );
};
