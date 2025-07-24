import { useState } from "react";
import { faKey, faVault } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

import { Modal, ModalContent } from "@app/components/v2";

import { EnvKeyPlatformModal } from "./EnvKeyPlatformModal";
import { VaultPlatformModal } from "./VaultPlatformModal";

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
    icon: faKey,
    platform: "env-key",
    title: "Env Key"
  },
  {
    icon: faVault,
    platform: "vault",
    title: "Vault"
  }
] as const;

export const SelectImportFromPlatformModal = ({ isOpen, onToggle }: Props) => {
  const [wizardStep, setWizardStep] = useState(WizardSteps.SelectPlatform);
  const [selectedPlatform, setSelectedPlatform] = useState<(typeof PLATFORM_LIST)[number] | null>(
    null
  );

  const handleFormReset = (state: boolean = false) => {
    onToggle(state);
    setWizardStep(WizardSteps.SelectPlatform);
    setSelectedPlatform(null);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(state) => handleFormReset(state)}>
      <ModalContent
        title={
          selectedPlatform ? `Import from ${selectedPlatform.title}` : "Import from external source"
        }
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
              <div className="mb-4 text-sm text-mineshaft-300">
                Select a platform to import from
              </div>
              <div className="flex items-center space-x-4">
                {PLATFORM_LIST.map((platform, idx) => (
                  <div
                    key={`platform-${idx + 1}`}
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
                    <FontAwesomeIcon icon={platform.icon} size="lg" />
                    <div className="whitespace-pre-wrap text-center text-sm">{platform.title}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {wizardStep === WizardSteps.PlatformInputs && (
            <>
              {selectedPlatform?.platform === "env-key" && (
                <motion.div
                  key="env-key-step"
                  transition={{ duration: 0.1 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -30 }}
                >
                  <EnvKeyPlatformModal onClose={() => handleFormReset(false)} />
                </motion.div>
              )}
              {selectedPlatform?.platform === "vault" && (
                <motion.div
                  key="vault-step"
                  transition={{ duration: 0.1 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -30 }}
                >
                  <VaultPlatformModal onClose={() => handleFormReset(false)} />
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
};
