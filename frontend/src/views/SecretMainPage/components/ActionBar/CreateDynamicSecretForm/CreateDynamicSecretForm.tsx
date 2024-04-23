import { useState } from "react";
import { faDatabase } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

import { Modal, ModalContent } from "@app/components/v2";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { SqlDatabaseInputForm } from "./SqlDatabaseInputForm";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  projectSlug: string;
  environment: string;
  secretPath: string;
};

enum WizardSteps {
  SelectProvider = "select-provider",
  ProviderInputs = "provider-inputs"
}

export const CreateDynamicSecretForm = ({
  isOpen,
  onToggle,
  projectSlug,
  environment,
  secretPath
}: Props) => {
  const [wizardStep, setWizardStep] = useState(WizardSteps.SelectProvider);
  const [selectedProvider, setSelectedProvider] = useState<DynamicSecretProviders | null>(null);

  const handleFormReset = (state: boolean = false) => {
    onToggle(state);
    setWizardStep(WizardSteps.SelectProvider);
    setSelectedProvider(null);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(state) => handleFormReset(state)}>
      <ModalContent
        title="Dynamic secret setup"
        subTitle="Configure dynamic secret parameters"
        className="my-4 max-w-3xl"
      >
        <AnimatePresence exitBeforeEnter>
          {wizardStep === WizardSteps.SelectProvider && (
            <motion.div
              key="select-type-step"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <div className="mb-4 text-mineshaft-300">Select a service to connect to:</div>
              <div className="flex items-center space-x-4">
                <div
                  className="flex h-32 w-32 cursor-pointer flex-col items-center space-y-4 rounded border border-mineshaft-500 bg-bunker-600 p-6 transition-all hover:border-primary/70 hover:bg-primary/10 hover:text-white"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedProvider(DynamicSecretProviders.SqlDatabase);
                    setWizardStep(WizardSteps.ProviderInputs);
                  }}
                  onKeyDown={(evt) => {
                    if (evt.key === "Enter") {
                      setSelectedProvider(DynamicSecretProviders.SqlDatabase);
                      setWizardStep(WizardSteps.ProviderInputs);
                    }
                  }}
                >
                  <FontAwesomeIcon icon={faDatabase} size="lg" />
                  <div className="text-center text-sm">
                    SQL
                    <br />
                    Database
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.SqlDatabase && (
              <motion.div
                key="select-input-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <SqlDatabaseInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environment={environment}
                />
              </motion.div>
            )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
};
