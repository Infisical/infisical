import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Modal, ModalContent, Step, Stepper } from "@app/components/v2";
import { useCreateSecretRotation } from "@app/hooks/api";
import { TSecretRotationProvider } from "@app/hooks/api/types";

import { useNotificationContext } from "~/components/context/Notifications/NotificationProvider";

import { GeneralDetailsForm, TFormSchema as TGeneralFormSchema } from "./steps/GeneralDetailsForm";
import { RotationInputForm } from "./steps/RotationInputForm";
import {
  RotationOutputForm,
  TFormSchema as TRotationOutputSchema
} from "./steps/RotationOutputForm";

const WIZARD_STEPS = [
  {
    title: "General"
  },
  {
    title: "Inputs"
  },
  {
    title: "Secret Mapping"
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
    general?: TGeneralFormSchema;
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
    if (!wizardData.current.general || !wizardData.current.input || !wizardData.current.output)
      return;
    try {
      await createSecretRotation({
        workspaceId,
        provider: provider.name,
        customProvider,
        secretPath: wizardData.current.general.secretPath,
        environment: wizardData.current.general.environment,
        interval: wizardData.current.general.interval,
        inputs: wizardData.current.input,
        outputs: wizardData.current.output
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
          {WIZARD_STEPS.map(({ title }, index) => (
            <Step title={title} key={`wizard-stepper-rotation-${index + 1}`} />
          ))}
        </Stepper>
        <AnimatePresence exitBeforeEnter>
          {wizardStep === 0 && (
            <motion.div
              key="general-step"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <GeneralDetailsForm
                onCancel={handleFormCancel}
                onSubmit={(data) => {
                  wizardData.current.general = data;
                  setWizardStep((state) => state + 1);
                }}
              />
            </motion.div>
          )}
          {wizardStep === 1 && (
            <RotationInputForm
              onCancel={handleFormCancel}
              onSubmit={(data) => {
                wizardData.current.input = data;
                setWizardStep((state) => state + 1);
              }}
              inputSchema={provider.template?.inputs || {}}
            />
          )}
          {wizardStep === 2 && (
            <RotationOutputForm
              environment={wizardData.current.general?.environment || ""}
              secretPath={wizardData.current.general?.secretPath || "/"}
              outputSchema={provider.template?.outputs || {}}
              onCancel={handleFormCancel}
              onSubmit={async (data) => {
                wizardData.current.output = data;
                await handleFormSubmit();
              }}
            />
          )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
};
