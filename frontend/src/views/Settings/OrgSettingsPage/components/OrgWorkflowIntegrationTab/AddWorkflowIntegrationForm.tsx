import { useState } from "react";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

import { Modal, ModalContent } from "@app/components/v2";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

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
    icon: faSlack,
    platform: WorkflowIntegrationPlatform.SLACK,
    title: "Slack"
  }
];

export const AddWorkflowIntegrationForm = ({ isOpen, onToggle }: Props) => {
  const [wizardStep, setWizardStep] = useState(WizardSteps.SelectPlatform);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const handleFormReset = (state: boolean = false) => {
    onToggle(state);
    setWizardStep(WizardSteps.SelectPlatform);
    setSelectedPlatform(null);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(state) => handleFormReset(state)}>
      <ModalContent title={`Add a ${selectedPlatform ?? "workflow"} integration`} className="my-4">
        <AnimatePresence exitBeforeEnter>
          {wizardStep === WizardSteps.SelectPlatform && (
            <motion.div
              key="select-type-step"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <div className="mb-4 text-mineshaft-300">Select a platform</div>
              <div className="flex items-center space-x-4">
                {PLATFORM_LIST.map(({ icon, platform, title }) => (
                  <div
                    key={platform}
                    className="flex h-28 w-32 cursor-pointer flex-col items-center space-y-4 rounded border border-mineshaft-500 bg-bunker-600 p-6 transition-all hover:border-primary/70 hover:bg-primary/10 hover:text-white"
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
                    <FontAwesomeIcon icon={icon} size="lg" />
                    <div className="whitespace-pre-wrap text-center text-sm">{title}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {wizardStep === WizardSteps.PlatformInputs &&
            selectedPlatform === WorkflowIntegrationPlatform.SLACK && (
              <motion.div
                key="slack-platform"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <SlackIntegrationForm onClose={() => onToggle(false)} />
              </motion.div>
            )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
};
