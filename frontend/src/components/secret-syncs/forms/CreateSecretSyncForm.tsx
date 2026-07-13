import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangleIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
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
import { useOrganization, useProject } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  SecretSync,
  SecretSyncInitialSyncBehavior,
  TSecretSync,
  useCreateSecretSync,
  useDuplicateDestinationCheck,
  useSecretSyncOption
} from "@app/hooks/api/secretSyncs";

import { SecretSyncOptionsFields } from "./SecretSyncOptionsFields/SecretSyncOptionsFields";
import { SecretSyncFormSchema, TSecretSyncForm } from "./schemas";
import { SecretSyncDestinationFields } from "./SecretSyncDestinationFields";
import { SecretSyncDetailsFields } from "./SecretSyncDetailsFields";
import {
  InitialSyncAlerts,
  SecretSyncInitialSyncBehaviorFields
} from "./SecretSyncInitialSyncBehaviorFields";
import { SecretSyncReviewFields } from "./SecretSyncReviewFields";
import { SecretSyncSourceFields } from "./SecretSyncSourceFields";

type Props = {
  onComplete: (secretSync: TSecretSync) => void;
  destination: SecretSync;
  onCancel: () => void;
  initialFormData?: Partial<TSecretSyncForm>;
};

type FormTab = {
  name: string;
  key: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
  fields: (keyof TSecretSyncForm)[];
};

const getFormTabs = (destination: SecretSync, destinationName: string): FormTab[] => {
  const sourceFields: (keyof TSecretSyncForm)[] =
    destination === SecretSync.AzureEntraIdScim
      ? ["secretPath", "environment", "syncOptions"]
      : ["secretPath", "environment"];

  return [
    {
      name: "Source",
      key: "source",
      shortDescription: "Pick env and path",
      title: "Source Secrets",
      subtitle: "Pick the Infisical environment and path to sync from.",
      rightLabel: "SOURCE",
      rightDescription:
        "Choose what gets synced. The environment + path together define the set of secrets this sync will push out.",
      fields: sourceFields
    },
    {
      name: "Destination",
      key: "destination",
      shortDescription: "Connect provider",
      title: `Connect to ${destinationName}`,
      subtitle: "Choose a connection and configure the target location.",
      rightLabel: "DESTINATION",
      rightDescription: `Tell Infisical where to write. Pick a ${destinationName} connection and the exact destination, like a workspace, project, namespace, or whatever this provider expects.`,
      fields: ["connection", "destinationConfig"]
    },
    {
      name: "Initial Sync",
      key: "initialSync",
      shortDescription: "How to resolve the first run",
      title: "Initial Sync Behavior",
      subtitle: `Choose how Infisical should reconcile existing secrets in ${destinationName} the first time this sync runs.`,
      rightLabel: "INITIAL SYNC",
      rightDescription:
        "The first run is special. Infisical can either overwrite everything in the destination or import existing secrets back into Infisical. Subsequent runs follow your sync options.",
      fields: ["syncOptions"]
    },
    {
      name: "Sync Options",
      key: "options",
      shortDescription: "Behavior + advanced",
      title: "Sync Options",
      subtitle: "Control how secrets are written and whether they sync automatically.",
      rightLabel: "SYNC OPTIONS",
      rightDescription:
        "Decide how Infisical reconciles changes on every run, including auto-sync, key schema, and how conflicts are handled.",
      fields: ["syncOptions"]
    },
    {
      name: "Details",
      key: "details",
      shortDescription: "Name + description",
      title: "Sync Details",
      subtitle: "Give this sync a name and an optional description.",
      rightLabel: "DETAILS",
      rightDescription:
        "A clear name helps when you have multiple syncs. The description shows up in the sync list as a tooltip.",
      fields: ["name", "description"]
    },
    {
      name: "Review",
      key: "review",
      shortDescription: "Confirm",
      title: "Review and Create",
      subtitle: "Double-check everything before creating the sync.",
      rightLabel: "REVIEW",
      rightDescription:
        "Verify your configuration before creating the sync. You can edit these settings later if needed.",
      fields: []
    }
  ];
};

export const CreateSecretSyncForm = ({
  destination,
  onComplete,
  onCancel,
  initialFormData
}: Props) => {
  const createSecretSync = useCreateSecretSync();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { name: destinationName } = SECRET_SYNC_MAP[destination];
  const formTabs = getFormTabs(destination, destinationName);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmBackToProvidersOpen, setConfirmBackToProvidersOpen] = useState(false);

  // scoot: right now we only do this when creating a connection so we know index 1
  const [selectedTabIndex, setSelectedTabIndex] = useState(initialFormData ? 1 : 0);

  const { syncOption } = useSecretSyncOption(destination);

  const formMethods = useForm<TSecretSyncForm>({
    resolver: zodResolver(SecretSyncFormSchema),
    defaultValues: {
      destination,
      isAutoSyncEnabled: true,
      syncOptions: {
        initialSyncBehavior: syncOption?.canImportSecrets
          ? SecretSyncInitialSyncBehavior.ImportPrioritizeSource
          : SecretSyncInitialSyncBehavior.OverwriteDestination,
        disableSecretDeletion: true
      },
      ...initialFormData
    } as Partial<TSecretSyncForm>,
    reValidateMode: "onChange"
  });

  const { handleSubmit, trigger, control, watch, formState } = formMethods;

  const onSubmit = async ({ environment, connection, ...formData }: TSecretSyncForm) => {
    try {
      const secretSync = await createSecretSync.mutateAsync({
        ...formData,
        connectionId: connection.id,
        environment: environment.slug,
        projectId: currentProject.id
      });

      createNotification({
        text: `Successfully added ${destinationName} Sync`,
        type: "success"
      });
      onComplete(secretSync);
    } catch {
      setShowConfirmation(false);
    }
  };

  const handlePrev = () => {
    if (selectedTabIndex === 0) {
      if (formState.isDirty) {
        setConfirmBackToProvidersOpen(true);
        return;
      }
      onCancel();
      return;
    }

    setSelectedTabIndex((prev) => prev - 1);
  };

  const { hasDuplicate } = useDuplicateDestinationCheck({
    destination,
    projectId: currentProject?.id || "",
    connectionId: watch("connection")?.id,
    syncOptions: watch("syncOptions"),
    enabled: true,
    destinationConfig: watch("destinationConfig")
  });

  const disableSecretDeletion = watch("syncOptions.disableSecretDeletion");
  const keySchema = watch("syncOptions.keySchema");
  const initialSyncBehavior = watch("syncOptions.initialSyncBehavior");
  const willDeleteUnmatchedSecrets =
    initialSyncBehavior === SecretSyncInitialSyncBehavior.OverwriteDestination &&
    !disableSecretDeletion &&
    !keySchema;

  const isStepValid = async (index: number) => trigger(formTabs[index].fields);

  const isFinalStep = selectedTabIndex === formTabs.length - 1;
  const isCreateButtonDisabled =
    isFinalStep && hasDuplicate && currentOrg?.blockDuplicateSecretSyncDestinations;

  const handleNext = async () => {
    if (isFinalStep) {
      setShowConfirmation(true);
      return;
    }

    const isValid = await isStepValid(selectedTabIndex);

    if (!isValid) return;

    setSelectedTabIndex((prev) => prev + 1);
  };

  const handleStepperChange = async (stepperIndex: number) => {
    // Provider step (index 0) jumps directly back to the provider selection screen,
    // regardless of which form tab the user is currently on.
    if (stepperIndex === 0) {
      if (formState.isDirty) {
        setConfirmBackToProvidersOpen(true);
        return;
      }
      onCancel();
      return;
    }

    const targetTab = stepperIndex - 1;
    if (targetTab === selectedTabIndex) return;

    // Allow jumping backwards freely; for forward jumps, validate every step in between
    if (targetTab < selectedTabIndex) {
      setSelectedTabIndex(targetTab);
      return;
    }

    let canJump = true;
    for (let i = selectedTabIndex; i < targetTab; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      canJump = canJump && (await isStepValid(i));
    }
    if (canJump) setSelectedTabIndex(targetTab);
  };

  const currentTab = formTabs[selectedTabIndex];
  // Stepper has Provider at index 0; form tabs start at stepper index 1.
  const stepperActiveStep = selectedTabIndex + 1;
  const totalSteps = formTabs.length + 1;
  const displayedStepNumber = stepperActiveStep + 1;

  return (
    <FormProvider {...formMethods}>
      <form className="flex h-full min-h-0 flex-col" onSubmit={(e) => e.preventDefault()}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
            <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
              Setup steps
            </p>
            <Stepper
              activeStep={stepperActiveStep}
              orientation="vertical"
              onStepChange={handleStepperChange}
            >
              <StepperList>
                <StepperStep
                  index={0}
                  title="Provider"
                  description={SECRET_SYNC_MAP[destination].name}
                />
                {formTabs.map((tab, i) => (
                  <StepperStep
                    key={tab.key}
                    index={i + 1}
                    title={tab.name}
                    description={tab.shortDescription}
                  />
                ))}
              </StepperList>
            </Stepper>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground">{currentTab.title}</h2>
              <p className="mt-1 text-sm text-muted">{currentTab.subtitle}</p>
            </div>

            {selectedTabIndex === 0 && <SecretSyncSourceFields />}
            {selectedTabIndex === 1 && <SecretSyncDestinationFields />}
            {selectedTabIndex === 2 && <SecretSyncInitialSyncBehaviorFields />}
            {selectedTabIndex === 3 && (
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
                            When secrets in the source change, sync to {destinationName}{" "}
                            automatically. Turn off to only sync manually.
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
            )}
            {selectedTabIndex === 4 && <SecretSyncDetailsFields />}
            {selectedTabIndex === 5 && <SecretSyncReviewFields />}
          </div>

          <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
            <div className="mb-auto">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                  Step {displayedStepNumber} · {currentTab.rightLabel}
                </p>
                <DocumentationLinkBadge
                  href={`https://infisical.com/docs/integrations/secret-syncs/${destination}`}
                />
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {currentTab.rightDescription}
              </p>
            </div>
            {selectedTabIndex >= 2 && (
              <InitialSyncAlerts
                onGoToInitialSync={() =>
                  setSelectedTabIndex(formTabs.findIndex((t) => t.key === "initialSync"))
                }
                onGoToOptions={() =>
                  setSelectedTabIndex(formTabs.findIndex((t) => t.key === "options"))
                }
              />
            )}
          </aside>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
          <span className="text-xs text-muted">{formState.isDirty ? "Unsaved changes" : ""}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">
              Step {displayedStepNumber} of {totalSteps}
            </span>
            <Button variant="outline" onClick={handlePrev}>
              Back
            </Button>
            <Button variant="project" onClick={handleNext} isDisabled={isCreateButtonDisabled}>
              {isFinalStep ? "Create Sync" : "Continue"}
            </Button>
          </div>
        </div>
      </form>
      <AlertDialog
        open={showConfirmation}
        onOpenChange={(open) => {
          if (!createSecretSync.isPending) setShowConfirmation(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon className="text-warning" />
            </AlertDialogMedia>
            <AlertDialogTitle>Secret Sync Behavior</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <p>Infisical is the source of truth for synced destinations.</p>
                <p>
                  Secrets in the destination will be overwritten, and any direct edits there may be
                  overwritten by future syncs.
                </p>
                {willDeleteUnmatchedSecrets && (
                  <p>
                    Secrets in {destinationName} that don&apos;t exist in Infisical will be deleted.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={createSecretSync.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="project"
              isDisabled={createSecretSync.isPending}
              onClick={handleSubmit(onSubmit)}
            >
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmBackToProvidersOpen} onOpenChange={setConfirmBackToProvidersOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard Sync Setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress configuring this sync will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={onCancel}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  );
};
