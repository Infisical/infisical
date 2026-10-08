import { LayoutTemplate, PlusIcon } from "lucide-react";

import { ProjectTemplatesUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectTemplate } from "@app/hooks/api/projectTemplates";
import { usePopUp } from "@app/hooks/usePopUp";

import { ProjectTemplateDetailsModal } from "./ProjectTemplateDetailsModal";
import { ProjectTemplatesTable } from "./ProjectTemplatesTable";

type Props = {
  projectType: ProjectType;
  onTemplateSelect: (template: TProjectTemplate) => void;
};

export const ProjectTemplatesSection = ({ projectType, onTemplateSelect }: Props) => {
  const { subscription } = useSubscription();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upgradePlan",
    "addTemplate"
  ] as const);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <LayoutTemplate className="size-4 text-accent" />
            Project Templates
          </CardTitle>
          <CardDescription>
            Create and configure templates with predefined roles and environments to streamline
            project setup.
          </CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgPermissionActions.Create}
              a={OrgPermissionSubjects.ProjectTemplates}
            >
              {(isAllowed) => (
                <Button
                  variant="project"
                  isDisabled={!isAllowed}
                  onClick={() => {
                    if (!subscription?.projectTemplates) {
                      handlePopUpOpen("upgradePlan", {
                        isEnterpriseFeature: true
                      });
                      return;
                    }

                    handlePopUpOpen("addTemplate");
                  }}
                >
                  <PlusIcon />
                  Add Template
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ProjectTemplatesTable projectType={projectType} onEdit={onTemplateSelect} />
        </CardContent>
      </Card>
      <ProjectTemplateDetailsModal
        projectType={projectType}
        onComplete={onTemplateSelect}
        isOpen={popUp.addTemplate.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addTemplate", isOpen)}
      />
      <UpgradeGate
        paywallKey="organization.project-templates"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        intent={{
          ...ProjectTemplatesUpgradeIntent,
          isEnterpriseFeature: Boolean(popUp.upgradePlan.data?.isEnterpriseFeature)
        }}
      />
    </>
  );
};
