import { useNavigate } from "@tanstack/react-router";
import { LayoutTemplate } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { TProjectTemplate } from "@app/hooks/api/projectTemplates";
import { usePopUp } from "@app/hooks/usePopUp";

import { ProjectTemplateDetailsModal } from "./ProjectTemplateDetailsModal";
import { ProjectTemplatesTable } from "./ProjectTemplatesTable";

export const ProjectTemplatesSection = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upgradePlan",
    "addTemplate"
  ] as const);

  const navigateToTemplate = (template: TProjectTemplate) => {
    if (!currentOrg?.id) return;

    navigate({
      to: "/organizations/$orgId/projects/secret-management/product-settings/project-templates/$templateId" as const,
      params: {
        orgId: currentOrg.id,
        templateId: template.id
      }
    });
  };

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
                  Add Template
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ProjectTemplatesTable onEdit={navigateToTemplate} />
        </CardContent>
      </Card>
      <ProjectTemplateDetailsModal
        onComplete={navigateToTemplate}
        isOpen={popUp.addTemplate.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addTemplate", isOpen)}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to project templates. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};
