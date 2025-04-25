import { useState } from "react";
import { BsMicrosoftTeams } from "react-icons/bs";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { Modal, ModalContent } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetWorkspaceWorkflowIntegrationConfig } from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { MicrosoftTeamsIntegrationForm } from "./MicrosoftTeamsIntegrationForm";
import { SlackIntegrationForm } from "./SlackIntegrationForm";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
};

enum WizardSteps {
  SelectPlatform = "select-platform",
  PlatformInputs = "platform-inputs"
}

const PLATFORM_LIST = [
  {
    icon: <FontAwesomeIcon icon={faSlack} size="lg" />,
    platform: WorkflowIntegrationPlatform.SLACK,
    title: "Slack"
  },
  {
    icon: <BsMicrosoftTeams className="text-lg" />,
    platform: WorkflowIntegrationPlatform.MICROSOFT_TEAMS,
    title: "Microsoft Teams"
  }
];

export const AddWorkflowIntegrationModal = ({ isOpen, onToggle }: Props) => {
  const [wizardStep, setWizardStep] = useState(WizardSteps.SelectPlatform);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const { currentWorkspace } = useWorkspace();
  const { data: microsoftTeamsConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    workspaceId: currentWorkspace?.id ?? "",
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
  });

  const { data: slackConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    workspaceId: currentWorkspace?.id ?? "",
    integration: WorkflowIntegrationPlatform.SLACK
  });

  const microsoftTeamsConfigured = !!microsoftTeamsConfig;
  const slackConfigured = !!slackConfig;

  const handleFormReset = (state: boolean = false) => {
    onToggle(state);
    setWizardStep(WizardSteps.SelectPlatform);
    setSelectedPlatform(null);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(state) => handleFormReset(state)}>
      <ModalContent
        title={`Add a ${selectedPlatform?.replace("-", " ").replace(/\b\w/g, (char) => char.toUpperCase()) ?? "workflow"} integration`}
        className="my-4"
      >
        <AnimatePresence mode="wait">
          {wizardStep === WizardSteps.SelectPlatform && (
            <motion.div
              key="select-type-step"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <div className="mb-4 text-mineshaft-300">Select a workflow integration</div>
              <div className="flex items-center space-x-4">
                {PLATFORM_LIST.map(({ icon, platform, title }) => {
                  const isConfigured =
                    (platform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS &&
                      microsoftTeamsConfigured) ||
                    (platform === WorkflowIntegrationPlatform.SLACK && slackConfigured);

                  return (
                    <div className="relative" key={platform}>
                      <div
                        className={twMerge(
                          "flex h-32 w-36 cursor-pointer flex-col items-center space-y-4 rounded border border-mineshaft-500 bg-bunker-600 p-6 transition-all hover:border-primary/70 hover:bg-primary/10 hover:text-white",
                          isConfigured && "border-primary/50 opacity-60"
                        )}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedPlatform(platform);
                          setWizardStep(WizardSteps.PlatformInputs);
                        }}
                        onKeyDown={(evt) => {
                          if (evt.key === "Enter") {
                            setSelectedPlatform(platform);
                            setWizardStep(WizardSteps.PlatformInputs);
                          }
                        }}
                      >
                        <div>{icon}</div>
                        <div className="whitespace-pre-wrap text-center text-sm">{title}</div>
                      </div>
                      {isConfigured && (
                        <div className="absolute bottom-0 left-0 right-0 z-30 h-full">
                          <div className="relative h-full">
                            <div className="absolute bottom-0 right-0 w-full flex-row items-center overflow-hidden whitespace-nowrap rounded-b-md bg-primary px-2 py-0.5 text-center text-xs text-black">
                              Already Configured
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {wizardStep === WizardSteps.PlatformInputs &&
            selectedPlatform === WorkflowIntegrationPlatform.SLACK && (
              <motion.div
                key="platform-inputs-step-slack"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <SlackIntegrationForm onClose={() => handleFormReset(false)} />
              </motion.div>
            )}
          {wizardStep === WizardSteps.PlatformInputs &&
            selectedPlatform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
              <motion.div
                key="platform-inputs-step-ms-teams"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <MicrosoftTeamsIntegrationForm onClose={() => handleFormReset(false)} />
              </motion.div>
            )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
};
