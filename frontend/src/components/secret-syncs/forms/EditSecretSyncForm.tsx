import { useCallback, useEffect, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  Label,
  Stepper,
  StepperList,
  StepperStep,
  Switch
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  TSecretSync,
  useCheckDuplicateDestination,
  useUpdateSecretSync
} from "@app/hooks/api/secretSyncs";

import { SecretSyncOptionsFields } from "./SecretSyncOptionsFields/SecretSyncOptionsFields";
import { DuplicateDestinationConfirmationModal } from "./DuplicateDestinationConfirmationModal";
import { TSecretSyncForm, UpdateSecretSyncFormSchema } from "./schemas";
import { SecretSyncDestinationFields } from "./SecretSyncDestinationFields";
import { SecretSyncDetailsFields } from "./SecretSyncDetailsFields";
import { SecretSyncInitialSyncBehaviorFields } from "./SecretSyncInitialSyncBehaviorFields";
import { SecretSyncSourceFields } from "./SecretSyncSourceFields";

type Props = {
  onComplete: (secretSync: TSecretSync) => void;
  secretSync: TSecretSync;
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

const getFormSteps = (secretSync: TSecretSync, destinationName: string): FormStep[] => {
  const steps: FormStep[] = [
    {
      key: "source",
      name: "Source",
      description: "Pick env and path",
      title: "Source Secrets",
      subtitle: "Pick the Infisical environment and path to sync from.",
      rightLabel: "SOURCE",
      rightDescription:
        "Choose what gets synced. The environment + path together define the set of secrets this sync will push out."
    },
    {
      key: "destination",
      name: "Destination",
      description: "Connect provider",
      title: `Connect to ${destinationName}`,
      subtitle: "Choose a connection and configure the target location.",
      rightLabel: "DESTINATION",
      rightDescription: `Tell Infisical where to write. Pick a ${destinationName} connection and the exact destination, like a workspace, project, namespace, or whatever this provider expects.`
    }
  ];

  if (!secretSync.lastSyncedAt) {
    steps.push({
      key: "initialSync",
      name: "Initial Sync",
      description: "First-run behavior",
      title: "Initial Sync Behavior",
      subtitle: `Choose how Infisical should reconcile existing secrets in ${destinationName} the first time this sync runs.`,
      rightLabel: "INITIAL SYNC",
      rightDescription:
        "The first run is special. Infisical can either overwrite everything in the destination or import existing secrets back into Infisical. Subsequent runs follow your sync options."
    });
  }

  steps.push({
    key: "options",
    name: "Sync Options",
    description: "Behavior + advanced",
    title: "Sync Options",
    subtitle: "Control how secrets are written and whether they sync automatically.",
    rightLabel: "SYNC OPTIONS",
    rightDescription:
      "Decide how Infisical reconciles changes on every run, including auto-sync, key schema, and how conflicts are handled."
  });

  steps.push({
    key: "details",
    name: "Details",
    description: "Name + description",
    title: "Sync Details",
    subtitle: "Give this sync a name and an optional description.",
    rightLabel: "DETAILS",
    rightDescription:
      "A clear name helps when you have multiple syncs. The description shows up in the sync list as a tooltip."
  });

  return steps;
};

const normalizeConfig = (config: unknown): unknown => {
  if (config === null || config === undefined || typeof config !== "object") {
    return config;
  }
  if (Array.isArray(config)) {
    return config.map(normalizeConfig);
  }
  const normalized: Record<string, unknown> = {};
  Object.keys(config as Record<string, unknown>)
    .sort()
    .forEach((key) => {
      normalized[key] = normalizeConfig((config as Record<string, unknown>)[key]);
    });
  return normalized;
};

export const EditSecretSyncForm = ({ secretSync, onComplete, onDirtyChange, onCancel }: Props) => {
  const updateSecretSync = useUpdateSecretSync();
  const { name: destinationName } = SECRET_SYNC_MAP[secretSync.destination];
  const { currentOrg } = useOrganization();
  const steps = getFormSteps(secretSync, destinationName);

  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [showDuplicateConfirmation, setShowDuplicateConfirmation] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<TSecretSyncForm | null>(null);
  const [destinationConfigToCheck, setDestinationConfigToCheck] = useState<unknown>(null);
  const [checkDuplicateEnabled, setCheckDuplicateEnabled] = useState(false);
  const [storedDuplicateProjectId, setStoredDuplicateProjectId] = useState<string | undefined>();

  const formMethods = useForm<TSecretSyncForm>({
    resolver: zodResolver(UpdateSecretSyncFormSchema),
    defaultValues: {
      ...secretSync,
      environment: secretSync.environment ?? undefined,
      secretPath: secretSync.folder?.path,
      description: secretSync.description ?? ""
    } as Partial<TSecretSyncForm>,
    reValidateMode: "onChange"
  });

  const { data: duplicateData, isLoading: isCheckingDuplicate } = useCheckDuplicateDestination(
    secretSync.destination,
    destinationConfigToCheck,
    secretSync.projectId,
    secretSync.id,
    formMethods.watch("connection")?.id,
    formMethods.watch("syncOptions"),
    { enabled: checkDuplicateEnabled && Boolean(destinationConfigToCheck) }
  );

  const performUpdate = useCallback(
    async (formData: TSecretSyncForm) => {
      const { environment, connection, ...updateData } = formData;
      const updatedSecretSync = await updateSecretSync.mutateAsync({
        syncId: secretSync.id,
        ...updateData,
        environment: environment?.slug,
        connectionId: connection.id,
        projectId: secretSync.projectId
      });

      createNotification({
        text: `Successfully updated ${destinationName} Sync`,
        type: "success"
      });
      onComplete(updatedSecretSync);
    },
    [updateSecretSync, secretSync.id, secretSync.projectId, destinationName, onComplete]
  );

  useEffect(() => {
    if (checkDuplicateEnabled && !isCheckingDuplicate && destinationConfigToCheck) {
      if (duplicateData?.hasDuplicate) {
        setStoredDuplicateProjectId(duplicateData.duplicateProjectId);
        setShowDuplicateConfirmation(true);
      } else if (pendingFormData) {
        performUpdate(pendingFormData);
        setPendingFormData(null);
      }
      setCheckDuplicateEnabled(false);
      setDestinationConfigToCheck(null);
    }
  }, [
    checkDuplicateEnabled,
    isCheckingDuplicate,
    duplicateData?.hasDuplicate,
    duplicateData?.duplicateProjectId,
    destinationConfigToCheck,
    pendingFormData,
    performUpdate
  ]);

  const hasDestinationConfigChanged = (formData: TSecretSyncForm) => {
    const originalConfig = normalizeConfig(secretSync.destinationConfig);
    const currentConfig = normalizeConfig(formData.destinationConfig);
    return JSON.stringify(originalConfig) !== JSON.stringify(currentConfig);
  };

  const onSubmit = async (formData: TSecretSyncForm) => {
    if (hasDestinationConfigChanged(formData)) {
      setDestinationConfigToCheck(formData.destinationConfig);
      setPendingFormData(formData);
      setCheckDuplicateEnabled(true);
      return;
    }
    await performUpdate(formData);
  };

  const handleConfirmDuplicate = async () => {
    if (pendingFormData) {
      await performUpdate(pendingFormData);
      setPendingFormData(null);
    }
    setShowDuplicateConfirmation(false);
    setCheckDuplicateEnabled(false);
    setDestinationConfigToCheck(null);
  };

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = formMethods;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const isLoading = isSubmitting || isCheckingDuplicate;
  const currentStep = steps[selectedStepIndex];

  const renderStep = () => {
    switch (currentStep.key) {
      case "details":
        return <SecretSyncDetailsFields />;
      case "source":
        return <SecretSyncSourceFields />;
      case "destination":
        return <SecretSyncDestinationFields />;
      case "initialSync":
        return <SecretSyncInitialSyncBehaviorFields />;
      case "options":
        return (
          <SecretSyncOptionsFields hideInitialSync>
            <Controller
              control={control}
              name="isAutoSyncEnabled"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="auto-sync-enabled">Auto-sync on changes</Label>
                      <FieldDescription>
                        When secrets in the source change, sync to {destinationName} automatically.
                        Turn off to only sync manually.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id="auto-sync-enabled"
                      variant="project"
                      checked={value}
                      onCheckedChange={onChange}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </SecretSyncOptionsFields>
        );
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
                  href={`https://infisical.com/docs/integrations/secret-syncs/${secretSync.destination}`}
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
              isPending={isLoading}
              isDisabled={!isDirty || isLoading}
            >
              {isCheckingDuplicate ? "Checking..." : "Save"}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={onCancel ?? (() => onComplete(secretSync))}
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

      <DuplicateDestinationConfirmationModal
        isOpen={showDuplicateConfirmation}
        onOpenChange={(open) => {
          setShowDuplicateConfirmation(open);
          if (!open) {
            setStoredDuplicateProjectId(undefined);
          }
        }}
        onConfirm={handleConfirmDuplicate}
        isLoading={updateSecretSync.isPending}
        duplicateProjectId={storedDuplicateProjectId}
        isDisabled={currentOrg?.blockDuplicateSecretSyncDestinations}
      />
    </FormProvider>
  );
};
