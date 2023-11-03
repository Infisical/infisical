import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Modal, ModalContent, Step, Stepper } from "@app/components/v2";
import { useCreateSecretRotation } from "@app/hooks/api";
import { TSecretRotationProvider } from "@app/hooks/api/types";

import { RotationInputForm } from "./steps/RotationInputForm";
import {
  RotationOutputForm,
  TFormSchema as TRotationOutputSchema
} from "./steps/RotationOutputForm";

const WIZARD_STEPS = [
  {
    title: "Inputs",
    description: "Provider secrets"
  },
  {
    title: "Outputs",
    description: "Map rotated secrets to keys"
  }
];

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  customProvider?: string;
  workspaceId: string;
  provider: TSecretRotationProvider;
};

export const CreateRotationForm = ({
  isOpen,
  onToggle,
  provider,
  workspaceId,
  customProvider
}: Props) => {
  const [wizardStep, setWizardStep] = useState(0);
  const wizardData = useRef<{
    input?: Record<string, string>;
    output?: TRotationOutputSchema;
  }>({});
  const { createNotification } = useNotificationContext();

  const { mutateAsync: createSecretRotation } = useCreateSecretRotation();

  const handleFormCancel = () => {
    onToggle(false);
    setWizardStep(0);
    wizardData.current = {};
  };

  const handleFormSubmit = async () => {
    if (!wizardData.current.input || !wizardData.current.output) return;
    try {
      await createSecretRotation({
        workspaceId,
        provider: provider.name,
        customProvider,
        secretPath: wizardData.current.output.secretPath,
        environment: wizardData.current.output.environment,
        interval: wizardData.current.output.interval,
        inputs: wizardData.current.input,
        outputs: wizardData.current.output.secrets
      });
      setWizardStep(0);
      onToggle(false);
      wizardData.current = {};
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to create secret rotation"
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(state) => {
        onToggle(state);
        setWizardStep(0);
        wizardData.current = {};
      }}
    >
      <ModalContent
        title={`Secret rotation for ${provider.name}`}
        subTitle="Provide the required inputs needed for the rotation"
        className="max-w-2xl"
      >
        <Stepper activeStep={wizardStep} direction="horizontal" className="mb-4">
          {WIZARD_STEPS.map(({ title, description }, index) => (
            <Step
              title={title}
              description={description}
              key={`wizard-stepper-rotation-${index + 1}`}
            />
          ))}
        </Stepper>
        <AnimatePresence exitBeforeEnter>
          {wizardStep === 0 && (
            <motion.div
              key="input-step"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <RotationInputForm
                onCancel={handleFormCancel}
                onSubmit={(data) => {
                  wizardData.current.input = data;
                  setWizardStep((state) => state + 1);
                }}
                inputSchema={provider.template?.inputs || {}}
              />
            </motion.div>
          )}
          {wizardStep === 1 && (
            <motion.div
              key="output-step"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <RotationOutputForm
                outputSchema={provider.template?.outputs || {}}
                onCancel={handleFormCancel}
                onSubmit={async (data) => {
                  wizardData.current.output = data;
                  await handleFormSubmit();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
};
