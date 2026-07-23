import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  Label,
  Stepper,
  StepperList,
  StepperStep,
  Switch
} from "@app/components/v3";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSync, TPkiSync, useUpdatePkiSync } from "@app/hooks/api/pkiSyncs";

import { TUpdatePkiSyncForm, UpdatePkiSyncFormSchema } from "./schemas/pki-sync-schema";
import { PkiSyncDestinationFields } from "./PkiSyncDestinationFields";
import { PkiSyncDetailsFields } from "./PkiSyncDetailsFields";
import { PkiSyncFieldMappingsFields } from "./PkiSyncFieldMappingsFields";
import { PkiSyncOptionsFields } from "./PkiSyncOptionsFields";

type Props = {
  onComplete: (pkiSync: TPkiSync) => void;
  pkiSync: TPkiSync;
  onDirtyChange?: (isDirty: boolean) => void;
  onCancel?: () => void;
};

type FormStep = {
  key: string;
  name: string;
  description: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
};

const getFormSteps = (destination: PkiSync): FormStep[] => {
  const steps: FormStep[] = [
    {
      key: "destination",
      name: "Destination",
      description: "Where to sync",
      title: "Destination",
      subtitle: "Choose a connection and configure the target location.",
      rightLabel: "DESTINATION",
      rightDescription:
        "Choose the connection and the destination where certificates will be pushed. The available fields depend on the selected service."
    },
    {
      key: "options",
      name: "Sync Options",
      description: "Sync behavior",
      title: "Sync Options",
      subtitle: "Control how certificates are written and whether they sync automatically.",
      rightLabel: "SYNC OPTIONS",
      rightDescription:
        "Control how certificates are synced, such as whether stale certificates are removed and whether the root CA is included. Auto-Sync pushes changes automatically as they occur."
    }
  ];

  if (destination === PkiSync.Chef || destination === PkiSync.AwsSecretsManager) {
    steps.push({
      key: "mappings",
      name: "Mappings",
      description: "Field mappings",
      title: "Field Mappings",
      subtitle: "Map each certificate component to the field names used at the destination.",
      rightLabel: "MAPPINGS",
      rightDescription:
        "Map each certificate component (certificate, private key, and chain) to the field names used at the destination."
    });
  }

  steps.push({
    key: "details",
    name: "Details",
    description: "Name and description",
    title: "Details",
    subtitle: "Give this sync a name and an optional description.",
    rightLabel: "DETAILS",
    rightDescription:
      "Give this sync a name and an optional description so your team can identify it later."
  });

  return steps;
};

export const EditPkiSyncForm = ({ pkiSync, onComplete, onDirtyChange, onCancel }: Props) => {
  const updatePkiSync = useUpdatePkiSync();
  const { name: destinationName } = PKI_SYNC_MAP[pkiSync.destination];
  const steps = getFormSteps(pkiSync.destination);

  const [selectedStepIndex, setSelectedStepIndex] = useState(0);

  const formMethods = useForm<TUpdatePkiSyncForm>({
    resolver: zodResolver(UpdatePkiSyncFormSchema),
    defaultValues: {
      name: pkiSync.name,
      destination: pkiSync.destination,
      description: pkiSync.description ?? "",
      connection: {
        id: pkiSync.connectionId,
        name: pkiSync.appConnectionName
      },
      syncOptions: pkiSync.syncOptions,
      destinationConfig: pkiSync.destinationConfig,
      isAutoSyncEnabled: pkiSync.isAutoSyncEnabled
    } as Partial<TUpdatePkiSyncForm>,
    reValidateMode: "onChange"
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = formMethods;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSubmit = async ({ connection, ...formData }: TUpdatePkiSyncForm) => {
    try {
      const updatedPkiSync = await updatePkiSync.mutateAsync({
        syncId: pkiSync.id,
        ...formData,
        connectionId: connection.id,
        projectId: pkiSync.projectId,
        destination: pkiSync.destination
      });

      createNotification({
        text: `Successfully updated ${destinationName} Certificate Sync`,
        type: "success"
      });
      onComplete(updatedPkiSync);
    } catch {
      createNotification({
        text: `Failed to update ${destinationName} Certificate Sync`,
        type: "error"
      });
    }
  };

  const currentStep = steps[selectedStepIndex];

  const renderStep = () => {
    switch (currentStep.key) {
      case "destination":
        return <PkiSyncDestinationFields />;
      case "options":
        return (
          <>
            <PkiSyncOptionsFields destination={pkiSync.destination} isUpdate />
            <Controller
              control={control}
              name="isAutoSyncEnabled"
              render={({ field: { value, onChange } }) => (
                <Field className="mt-2">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="auto-sync-enabled">Auto-sync on changes</Label>
                      <FieldDescription>
                        When certificates in the selected list change, sync automatically. Turn off
                        to only sync manually.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id="auto-sync-enabled"
                      variant="project"
                      checked={value}
                      onCheckedChange={onChange}
                    />
                  </Field>
                </Field>
              )}
            />
          </>
        );
      case "mappings":
        return <PkiSyncFieldMappingsFields destination={pkiSync.destination} />;
      case "details":
        return <PkiSyncDetailsFields />;
      default:
        return null;
    }
  };

  return (
    <FormProvider {...formMethods}>
      <form className="flex h-full min-h-0 flex-col" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
            <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
              Sections
            </p>
            <Stepper
              activeStep={selectedStepIndex}
              orientation="vertical"
              onStepChange={setSelectedStepIndex}
              nonLinear
            >
              <StepperList>
                {steps.map((step, i) => (
                  <StepperStep
                    key={step.key}
                    index={i}
                    title={step.name}
                    description={step.description}
                  />
                ))}
              </StepperList>
            </Stepper>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground">{currentStep.title}</h2>
              <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
            </div>
            {renderStep()}
          </div>

          <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
            <div className="mb-auto">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                  Step {selectedStepIndex + 1} · {currentStep.rightLabel}
                </p>
                <DocumentationLinkBadge
                  href={`https://infisical.com/docs/documentation/platform/pki/applications/certificate-syncs/${pkiSync.destination}`}
                />
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {currentStep.rightDescription}
              </p>
            </div>
          </aside>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="project"
              type="submit"
              isPending={isSubmitting}
              isDisabled={!isDirty || isSubmitting}
            >
              Save
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={onCancel ?? (() => onComplete(pkiSync))}
            >
              Cancel
            </Button>
            <span className="text-xs text-muted">{isDirty ? "Unsaved changes" : ""}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">
              Step {selectedStepIndex + 1} of {steps.length}
            </span>
            <Button
              variant="outline"
              type="button"
              onClick={() => setSelectedStepIndex((i) => Math.max(0, i - 1))}
              isDisabled={selectedStepIndex === 0}
            >
              Back
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => setSelectedStepIndex((i) => Math.min(steps.length - 1, i + 1))}
              isDisabled={selectedStepIndex === steps.length - 1}
            >
              Next
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};
