import { useState } from "react";
import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

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
      <AnimatePresence>
        {editTemplate ? (
          <motion.div
            key="edit-project-template"
            transition={{ duration: 0.3 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
            className="absolute min-h-40 w-full"
          >
            <EditProjectTemplateSection
              template={editTemplate}
              onBack={() => setEditTemplate(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="project-templates-list"
            transition={{ duration: 0.3 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
            className="absolute min-h-40 w-full"
          >
            <div>
              <p className="font-inter text-bunker-300 mb-6">
                Create and configure templates with predefined roles and environments to streamline
                project setup
              </p>
              <div className="border-mineshaft-600 bg-mineshaft-900 mb-6 rounded-lg border p-4">
                <div className="mb-4 flex items-start">
                  <p className="text-mineshaft-100 text-xl font-medium">Project Templates</p>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://infisical.com/docs/documentation/platform/project-templates"
                  >
                    <div className="bg-yellow/20 text-yellow ml-2 mt-[0.32rem] inline-block rounded-md px-1.5 text-sm opacity-80 hover:opacity-100">
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
                            handlePopUpOpen("upgradePlan");
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
                  text="You can create project templates if you switch to Infisical's Enterprise plan."
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
