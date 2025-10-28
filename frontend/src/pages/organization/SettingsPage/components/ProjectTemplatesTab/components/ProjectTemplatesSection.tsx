import { useState } from "react";
import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { TProjectTemplate } from "@app/hooks/api/projectTemplates";
import { usePopUp } from "@app/hooks/usePopUp";

import { EditProjectTemplateSection } from "./EditProjectTemplateSection";
import { ProjectTemplateDetailsModal } from "./ProjectTemplateDetailsModal";
import { ProjectTemplatesTable } from "./ProjectTemplatesTable";

export const ProjectTemplatesSection = () => {
  const { subscription } = useSubscription();
  const [editTemplate, setEditTemplate] = useState<TProjectTemplate | null>(null);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "upgradePlan",
    "addTemplate"
  ] as const);

  return (
    <div className="relative">
      {editTemplate ? (
        <EditProjectTemplateSection template={editTemplate} onBack={() => setEditTemplate(null)} />
      ) : (
        <div>
          <p className="mb-6 font-inter text-bunker-300">
            Create and configure templates with predefined roles and environments to streamline
            project setup
          </p>
          <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <div className="mb-4 flex items-start">
              <p className="text-xl font-medium text-mineshaft-100">Project Templates</p>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/documentation/platform/project-templates"
              >
                <div className="mt-[0.32rem] ml-2 inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  <span>Docs</span>
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1.5 text-[10px]"
                  />
                </div>
              </a>
              <OrgPermissionCan
                I={OrgPermissionActions.Create}
                a={OrgPermissionSubjects.ProjectTemplates}
              >
                {(isAllowed) => (
                  <Button
                    colorSchema="secondary"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => {
                      if (!subscription?.projectTemplates) {
                        handlePopUpOpen("upgradePlan", {
                          isEnterpriseFeature: true
                        });
                        return;
                      }

                      handlePopUpOpen("addTemplate");
                    }}
                    isDisabled={!isAllowed}
                    className="ml-auto"
                  >
                    Add Template
                  </Button>
                )}
              </OrgPermissionCan>
            </div>
            <ProjectTemplatesTable onEdit={setEditTemplate} />
            <ProjectTemplateDetailsModal
              onComplete={(template) => setEditTemplate(template)}
              isOpen={popUp.addTemplate.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("addTemplate", isOpen)}
            />
            <UpgradePlanModal
              isOpen={popUp.upgradePlan.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
              text="Your current plan does not provide access to project templates. To unlock this feature, please upgrade to Infisical Enterprise plan."
              isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
            />
          </div>
        </div>
      )}
    </div>
  );
};
