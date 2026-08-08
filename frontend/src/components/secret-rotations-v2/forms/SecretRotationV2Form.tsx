import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { SecretRotationV2ConfigurationFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2ConfigurationFields";
import { SecretRotationV2DetailsFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2DetailsFields";
import { SecretRotationV2ParametersFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2ParametersFields";
import { SecretRotationV2ReviewFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2ReviewFields";
import { SecretRotationV2SecretsMappingFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2SecretsMappingFields";
import {
  Button,
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { useProject } from "@app/context";
import { IS_ROTATION_DUAL_CREDENTIALS, SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import {
  SecretRotation,
  TSecretRotationV2,
  useSecretRotationV2Option
} from "@app/hooks/api/secretRotationsV2";
import {
  useCreateSecretRotationV2,
  useUpdateSecretRotationV2
} from "@app/hooks/api/secretRotationsV2/mutations";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { SecretRotationV2FormSchema, TSecretRotationV2Form } from "./schemas";

type Props = {
  onComplete: (secretRotation: TSecretRotationV2) => void;
  type: SecretRotation;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  secretPath: string;
  environment?: string;
  environments?: ProjectEnv[];
  secretRotation?: TSecretRotationV2;
  initialFormData?: Partial<TSecretRotationV2Form>;
};

type FormStep = {
  name: string;
  key: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
  fields: (keyof TSecretRotationV2Form)[];
};

const FORM_STEPS: FormStep[] = [
  {
    name: "Configuration",
    key: "configuration",
    shortDescription: "Connection and schedule",
    title: "Configure the rotation",
    subtitle: "Choose the connection and decide when Infisical should rotate these credentials.",
    rightLabel: "Configuration",
    rightDescription:
      "The connection identifies the provider account. The schedule controls how often Infisical replaces its active credentials.",
    fields: [
      "isAutoRotationEnabled",
      "environment",
      "rotationInterval",
      "connection",
      "rotateAtUtc"
    ]
  },
  {
    name: "Parameters",
    key: "parameters",
    shortDescription: "Provider settings",
    title: "Set provider parameters",
    subtitle: "Choose the provider resource and configure how its credentials should be rotated.",
    rightLabel: "Parameters",
    rightDescription:
      "These settings are specific to the selected provider and determine which account or resource Infisical manages.",
    // @ts-expect-error temporary parameters are only present on rotations that need setup credentials
    fields: ["parameters", "temporaryParameters"]
  },
  {
    name: "Mappings",
    key: "secretsMapping",
    shortDescription: "Generated secret keys",
    title: "Map generated credentials",
    subtitle: "Choose the Infisical secret keys that will receive each generated credential.",
    rightLabel: "Mappings",
    rightDescription:
      "Each generated value is written to the mapped secret key in the selected environment and path.",
    fields: ["secretsMapping"]
  },
  {
    name: "Details",
    key: "details",
    shortDescription: "Name and description",
    title: "Add rotation details",
    subtitle: "Give this rotation a clear name and an optional description.",
    rightLabel: "Details",
    rightDescription:
      "Use a name that distinguishes this rotation from other provider accounts and environments.",
    fields: ["name", "description"]
  },
  {
    name: "Review",
    key: "review",
    shortDescription: "Confirm configuration",
    title: "Review the rotation",
    subtitle: "Confirm the configuration before saving the secret rotation.",
    rightLabel: "Review",
    rightDescription:
      "Verify the connection, schedule, provider parameters, and generated secret mappings before continuing.",
    fields: []
  }
];

const DEFAULT_ROTATION_INTERVAL = 30;

export const SecretRotationV2Form = ({
  type,
  onComplete,
  onCancel,
  onDirtyChange,
  environment: envSlug,
  secretPath,
  secretRotation,
  environments,
  initialFormData
}: Props) => {
  const createSecretRotation = useCreateSecretRotationV2();
  const updateSecretRotation = useUpdateSecretRotationV2();
  const { currentProject } = useProject();
  const { name: rotationType } = SECRET_ROTATION_MAP[type];
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const { rotationOption } = useSecretRotationV2Option(type);

  const formMethods = useForm<TSecretRotationV2Form>({
    resolver: zodResolver(SecretRotationV2FormSchema(Boolean(secretRotation))),
    defaultValues: (secretRotation
      ? {
          ...secretRotation,
          environment: currentProject?.environments.find((env) => env.slug === envSlug),
          secretPath
        }
      : {
          type,
          isAutoRotationEnabled: IS_ROTATION_DUAL_CREDENTIALS[type],
          rotationInterval: DEFAULT_ROTATION_INTERVAL,
          rotateAtUtc: {
            hours: 0,
            minutes: 0
          },
          environment: currentProject?.environments.find((env) => env.slug === envSlug),
          secretPath,
          ...((rotationOption?.template as object) ?? {}),
          ...(initialFormData as object)
        }) as Partial<TSecretRotationV2Form>,
    mode: "onChange",
    reValidateMode: "onChange"
  });

  const { handleSubmit, trigger, formState } = formMethods;
  const {
    confirmDiscard,
    isDiscardDialogOpen,
    requestDiscard: requestCancel,
    setIsDiscardDialogOpen
  } = useDiscardChangesGuard({ isDirty: formState.isDirty, onDiscard: onCancel });

  useEffect(() => {
    onDirtyChange?.(formState.isDirty);
    return () => onDirtyChange?.(false);
  }, [formState.isDirty, onDirtyChange]);

  const onSubmit = async ({ environment, connection, ...formData }: TSecretRotationV2Form) => {
    const mutation = secretRotation
      ? updateSecretRotation.mutateAsync({
          rotationId: secretRotation.id,
          projectId: secretRotation.projectId,
          ...formData
        })
      : createSecretRotation.mutateAsync({
          ...formData,
          connectionId: connection.id,
          environment: environment.slug,
          projectId: currentProject.id
        });
    const rotation = await mutation;

    createNotification({
      text: `Successfully ${secretRotation ? "updated" : "created"} ${rotationType} rotation`,
      type: "success"
    });
    onComplete(rotation);
  };

  const handlePrev = () => {
    if (selectedStepIndex === 0) {
      requestCancel();
      return;
    }
    setSelectedStepIndex((previous) => previous - 1);
  };

  const isStepValid = async (index: number) => trigger(FORM_STEPS[index].fields);
  const isFinalStep = selectedStepIndex === FORM_STEPS.length - 1;

  const handleNext = async () => {
    if (isFinalStep) {
      await handleSubmit(onSubmit)();
      return;
    }

    if (await isStepValid(selectedStepIndex)) {
      setSelectedStepIndex((previous) => previous + 1);
    }
  };

  const providerStepOffset = secretRotation ? 0 : 1;
  const activeStepperIndex = selectedStepIndex + providerStepOffset;
  const totalSteps = FORM_STEPS.length + providerStepOffset;
  const displayedStepNumber = activeStepperIndex + 1;

  const handleStepperChange = (stepperIndex: number) => {
    if (!secretRotation && stepperIndex === 0) {
      requestCancel();
      return;
    }

    const targetStepIndex = stepperIndex - providerStepOffset;
    if (targetStepIndex >= 0 && targetStepIndex < selectedStepIndex) {
      setSelectedStepIndex(targetStepIndex);
    }
  };

  const currentStep = FORM_STEPS[selectedStepIndex];
  const stepperSteps = (
    <Stepper
      activeStep={activeStepperIndex}
      orientation="vertical"
      onStepChange={handleStepperChange}
    >
      <StepperList>
        {!secretRotation && (
          <StepperStep index={0} title="Provider" description={SECRET_ROTATION_MAP[type].name} />
        )}
        {FORM_STEPS.map((step, index) => (
          <StepperStep
            key={step.key}
            index={index + providerStepOffset}
            title={step.name}
            description={step.shortDescription}
          />
        ))}
      </StepperList>
    </Stepper>
  );

  return (
    <FormProvider {...formMethods}>
      <form className="flex h-full min-h-0 flex-col" onSubmit={(event) => event.preventDefault()}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="hidden w-60 shrink-0 flex-col border-r border-border px-5 py-6 md:flex">
            <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
              Setup steps
            </p>
            {stepperSteps}
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="border-b border-border px-4 py-4 md:hidden">
              <p className="text-xs font-medium text-muted">
                Step {displayedStepNumber} of {totalSteps}: {currentStep.name}
              </p>
            </div>
            <div className="flex w-full max-w-3xl flex-col gap-y-2 px-4 py-6 md:px-8">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">{currentStep.title}</h2>
                <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
              </div>

              {selectedStepIndex === 0 && (
                <SecretRotationV2ConfigurationFields
                  isUpdate={Boolean(secretRotation)}
                  environments={environments}
                />
              )}
              {selectedStepIndex === 1 && <SecretRotationV2ParametersFields />}
              {selectedStepIndex === 2 && <SecretRotationV2SecretsMappingFields />}
              {selectedStepIndex === 3 && <SecretRotationV2DetailsFields />}
              {selectedStepIndex === 4 && <SecretRotationV2ReviewFields />}
            </div>
          </div>

          <aside className="hidden w-80 shrink-0 flex-col border-l border-border px-6 py-6 xl:flex">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                Step {displayedStepNumber} · {currentStep.rightLabel}
              </p>
              <DocumentationLinkBadge
                href={`https://infisical.com/docs/documentation/platform/secret-rotation/${type}`}
              />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {currentStep.rightDescription}
            </p>
          </aside>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-4 md:px-6">
          <span className="text-xs text-muted">{formState.isDirty ? "Unsaved changes" : ""}</span>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">
              Step {displayedStepNumber} of {totalSteps}
            </span>
            <Button variant="outline" onClick={handlePrev} isDisabled={formState.isSubmitting}>
              Back
            </Button>
            <Button
              variant="project"
              onClick={handleNext}
              isPending={formState.isSubmitting}
              isDisabled={formState.isSubmitting}
            >
              {isFinalStep ? `${secretRotation ? "Update" : "Create"} secret rotation` : "Continue"}
            </Button>
          </div>
        </div>
      </form>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title={secretRotation ? "Discard Changes?" : "Discard Secret Rotation Setup?"}
        description={
          secretRotation
            ? "Your unsaved changes to this secret rotation will be lost."
            : "Your progress configuring this secret rotation will be lost."
        }
      />
    </FormProvider>
  );
};
