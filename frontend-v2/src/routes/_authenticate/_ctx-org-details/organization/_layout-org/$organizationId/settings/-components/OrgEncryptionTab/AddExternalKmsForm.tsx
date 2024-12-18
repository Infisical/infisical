import { useState } from "react";
import { faAws, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

import { Modal, ModalContent } from "@app/components/v2";
import { ExternalKmsProvider } from "@app/hooks/api/kms/types";

import { AwsKmsForm } from "./AwsKmsForm";
import { GcpKmsForm } from "./GcpKmsForm";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
};

enum WizardSteps {
  SelectProvider = "select-provider",
  ProviderInputs = "provider-inputs"
}

const EXTERNAL_KMS_LIST = [
  {
    icon: faAws,
    provider: ExternalKmsProvider.Aws,
    title: "AWS KMS"
  },
  {
    icon: faGoogle,
    provider: ExternalKmsProvider.Gcp,
    title: "GCP KMS"
  }
];

export const AddExternalKmsForm = ({ isOpen, onToggle }: Props) => {
  const [wizardStep, setWizardStep] = useState(WizardSteps.SelectProvider);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const handleFormReset = (state: boolean = false) => {
    onToggle(state);
    setWizardStep(WizardSteps.SelectProvider);
    setSelectedProvider(null);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(state) => handleFormReset(state)}>
      <ModalContent
        title="Add a Key Management System"
        subTitle="Configure an external key management system (KMS)"
        className="my-4"
        bodyClassName="overflow-visible"
      >
        <AnimatePresence mode="wait">
          {wizardStep === WizardSteps.SelectProvider && (
            <motion.div
              key="select-type-step"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <div className="mb-4 text-mineshaft-300">Select a KMS Provider</div>
              <div className="flex items-center space-x-4">
                {EXTERNAL_KMS_LIST.map(({ icon, provider, title }) => (
                  <div
                    key={`kms-${provider}`}
                    className="flex h-28 w-32 cursor-pointer flex-col items-center space-y-4 rounded border border-mineshaft-500 bg-bunker-600 p-6 transition-all hover:border-primary/70 hover:bg-primary/10 hover:text-white"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedProvider(provider);
                      setWizardStep(WizardSteps.ProviderInputs);
                    }}
                    onKeyDown={(evt) => {
                      if (evt.key === "Enter") {
                        setSelectedProvider(provider);
                        setWizardStep(WizardSteps.ProviderInputs);
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
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === ExternalKmsProvider.Aws && (
              <motion.div
                key="kms-aws"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <AwsKmsForm onCancel={() => onToggle(false)} onCompleted={() => onToggle(false)} />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === ExternalKmsProvider.Gcp && (
              <motion.div
                key="kms-gcp"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <GcpKmsForm onCancel={() => onToggle(false)} onCompleted={() => onToggle(false)} />
              </motion.div>
            )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
};
