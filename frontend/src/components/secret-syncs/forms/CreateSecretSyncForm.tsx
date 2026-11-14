import { useEffect, useState } from "react";
import { Controller, FieldPath, FormProvider, useForm } from "react-hook-form";
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
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  Label,
  SheetFooter,
  Stepper,
  StepperList,
  StepperStep,
  Toggle
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  SecretSync,
  SecretSyncInitialSyncBehavior,
  TSecretSync,
  useCreateSecretSync,
  useDuplicateDestinationCheck,
  useRecursiveConflictsCheck,
  useSecretSyncOption
} from "@app/hooks/api/secretSyncs";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { getSecretSyncDestinationConfig, SecretSyncFormSchema, TSecretSyncForm } from "./schemas";
import { SecretSyncDestinationFields } from "./SecretSyncDestinationFields";
import { SecretSyncDetailsFields } from "./SecretSyncDetailsFields";
import {
  InitialSyncAlerts,
  SecretSyncInitialSyncBehaviorFields
} from "./SecretSyncInitialSyncBehaviorFields";
import { SecretSyncOptionsFields } from "./SecretSyncOptionsFields/SecretSyncOptionsFields";
import { SecretSyncReviewFields } from "./SecretSyncReviewFields";
import { SecretSyncSourceFields } from "./SecretSyncSourceFields";

type Props = {
  onComplete: (secretSync: TSecretSync) => void;
  destination: SecretSync;
  onCancel: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  initialFormData?: Partial<TSecretSyncForm>;
  initialFormDataIsDirty?: boolean;
  startOnDestination?: boolean;
};

type FormTab = {
  name: string;
  key: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightLabel: string;
  rightDescription: string;
  rightExtra?: {
    title: string;
    description: string;
    examples: { path: string; result: string; tone: "warning" | "success" }[];
  };
  fields: FieldPath<TSecretSyncForm>[];
};

const getFormTabs = (
  destination: SecretSync,
  destinationName: string,
  supportsFolderStructure: boolean
): FormTab[] => {
  const sourceFields: (keyof TSecretSyncForm)[] =
    destination === SecretSync.AzureEntraIdScim
      ? ["secretPath", "environment", "includeAllSubFolders", "syncOptions"]
      : ["secretPath", "environment", "includeAllSubFolders"];

  const mirroredPrefix = destination === SecretSync.AWSParameterStore ? "/prod/" : "";

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
      fields: sourceFields,
      ...(supportsFolderStructure && {
        subtitle: "Pick the Infisical environment, path, and how deep this sync reaches.",
        rightDescription:
          "Choose what gets synced. The environment and path define the set of secrets this sync pushes out. Including nested folders sweeps every folder under the path into the same sync.",
        rightExtra: {
          title: "About duplicate keys",
          description:
            "The same key can exist in several folders. What happens to duplicates is decided by the folder mapping in the Destination step: mirroring keeps every value at its own path, while flattening needs each name to be unique.",
          examples: [
            { path: "/backend/API_KEY", result: "duplicate", tone: "warning" },
            { path: "/backend/api/API_KEY", result: "duplicate", tone: "warning" }
          ]
        }
      })
    },
    {
      name: "Destination",
      key: "destination",
      shortDescription: "Connect provider",
      title: `Connect to ${destinationName}`,
      subtitle: "Choose a connection and configure the target location.",
      rightLabel: "DESTINATION",
      rightDescription: `Tell Infisical where to write. Pick a ${destinationName} connection and the exact destination, like a workspace, project, namespace, or whatever this provider expects.`,
      fields: ["connection", "destinationConfig"],
      ...(supportsFolderStructure && {
        rightExtra: {
          title: "Folder mapping",
          description:
            destination === SecretSync.AWSParameterStore
              ? "Mirror recreates your Infisical folder tree under the base path, one-to-one. Every key keeps its own path, so duplicate keys never collide."
              : "Mirror prefixes each secret's name with its folder, one-to-one. Every key keeps its own name, so duplicate keys never collide.",
          examples: [
            {
              path: "/backend/api/API_KEY",
              result: `${mirroredPrefix}api/API_KEY`,
              tone: "success"
            },
            {
              path: "/backend/workers/API_KEY",
              result: `${mirroredPrefix}workers/API_KEY`,
              tone: "success"
            }
          ]
        }
      })
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
      // Only the field this step shows: a check on another step's sync option would otherwise block
      // the way forward to the step where it can be fixed.
      fields: ["syncOptions.initialSyncBehavior"]
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
  onDirtyChange,
  initialFormData,
  initialFormDataIsDirty = Boolean(initialFormData),
  startOnDestination = Boolean(initialFormData)
}: Props) => {
  const createSecretSync = useCreateSecretSync();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { name: destinationName } = SECRET_SYNC_MAP[destination];
  const { syncOption } = useSecretSyncOption(destination);
  const supportsFolderStructure = Boolean(syncOption?.supportsPreserveFolderStructure);
  const formTabs = getFormTabs(destination, destinationName, supportsFolderStructure);

  const [showConfirmation, setShowConfirmation] = useState(false);

  const [selectedTabIndex, setSelectedTabIndex] = useState(startOnDestination ? 1 : 0);

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
    // Step validation uses trigger(), which does not put the form into its submitted state.
    // Validate changes from the start so a field's error clears as soon as it is corrected.
    mode: "onChange",
    reValidateMode: "onChange"
  });

  const { handleSubmit, trigger, control, watch, formState } = formMethods;
  const hasUnsavedChanges = formState.isDirty || initialFormDataIsDirty;
  const {
    confirmDiscard,
    isDiscardDialogOpen,
    requestDiscard: requestCancel,
    setIsDiscardDialogOpen
  } = useDiscardChangesGuard({ isDirty: hasUnsavedChanges, onDiscard: onCancel });

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
    return () => onDirtyChange(false);
  }, [hasUnsavedChanges, onDirtyChange]);

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
      requestCancel();
      return;
    }

    setSelectedTabIndex((prev) => prev - 1);
  };

  const { hasDuplicate } = useDuplicateDestinationCheck({
    destination,
    projectId: currentProject?.id || "",
    connectionId: watch("connection")?.id,
    enabled: true,
    destinationConfig: getSecretSyncDestinationConfig(destination, watch("destinationConfig"))
  });

  const disableSecretDeletion = watch("syncOptions.disableSecretDeletion");
  const keySchema = watch("syncOptions.keySchema");
  const initialSyncBehavior = watch("syncOptions.initialSyncBehavior");
  const willDeleteUnmatchedSecrets =
    initialSyncBehavior === SecretSyncInitialSyncBehavior.OverwriteDestination &&
    !disableSecretDeletion &&
    !keySchema;
  const importsFromDestination =
    initialSyncBehavior === SecretSyncInitialSyncBehavior.ImportPrioritizeSource ||
    initialSyncBehavior === SecretSyncInitialSyncBehavior.ImportPrioritizeDestination;

  const { conflicts: recursiveConflicts } = useRecursiveConflictsCheck({
    destination,
    projectId: currentProject?.id || "",
    environment: watch("environment")?.slug,
    secretPath: watch("secretPath"),
    keySchema,
    includeAllSubFolders: Boolean(watch("includeAllSubFolders")) && !importsFromDestination
  });

  const isStepValid = async (index: number) => trigger(formTabs[index].fields);

  // Duplicate names block a flattened sync. Where the destination can keep folders instead, that
  // choice is made in the Destination step, so the block moves there and lifts once folders are kept.
  const preservesFolderStructure = Boolean(watch("syncOptions.preserveFolderStructure"));
  const isSourceBlocked = !supportsFolderStructure && recursiveConflicts.length > 0;
  const isDestinationBlocked =
    supportsFolderStructure && !preservesFolderStructure && recursiveConflicts.length > 0;

  const isFinalStep = selectedTabIndex === formTabs.length - 1;
  const isSourceStep = selectedTabIndex === 0;
  const isDestinationStep = selectedTabIndex === 1;
  const isNextButtonDisabled =
    (isFinalStep && hasDuplicate && currentOrg?.blockDuplicateSecretSyncDestinations) ||
    (isSourceStep && isSourceBlocked) ||
    (isDestinationStep && isDestinationBlocked);

  const handleNext = async () => {
    if (isFinalStep) {
      setShowConfirmation(true);
      return;
    }

    if ((isSourceStep && isSourceBlocked) || (isDestinationStep && isDestinationBlocked)) return;

    const isValid = await isStepValid(selectedTabIndex);

    if (!isValid) return;

    setSelectedTabIndex((prev) => prev + 1);
  };

  const handleStepperChange = async (stepperIndex: number) => {
    // Provider step (index 0) jumps directly back to the provider selection screen,
    // regardless of which form tab the user is currently on.
    if (stepperIndex === 0) {
      requestCancel();
      return;
    }

    const targetTab = stepperIndex - 1;
    if (targetTab === selectedTabIndex) return;

    // Allow jumping backwards freely; for forward jumps, validate every step in between
    if (targetTab < selectedTabIndex) {
      setSelectedTabIndex(targetTab);
      return;
    }

    // The Source step (index 0) is always behind a forward jump, since targetTab > selectedTabIndex
    // here, so a conflict there must block the jump the same way it blocks handleNext. The same goes
    // for the Destination step (index 1) when the jump passes it.
    if (isSourceBlocked) return;
    if (isDestinationBlocked && selectedTabIndex <= 1 && targetTab > 1) return;

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
              <h2 className="text-lg font-normal text-foreground">{currentTab.title}</h2>
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
                        <Toggle
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
              {currentTab.rightExtra && (
                <>
                  <p className="mt-6 text-sm font-semibold text-foreground">
                    {currentTab.rightExtra.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {currentTab.rightExtra.description}
                  </p>
                  <div className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-container p-4 font-mono text-xs">
                    {currentTab.rightExtra.examples.map(({ path, result, tone }) => (
                      <div key={path}>
                        <p className="text-label">{path}</p>
                        <p className={tone === "warning" ? "text-warning" : "text-success"}>
                          → {result}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
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

        <SheetFooter className="shrink-0 items-center justify-between border-t">
          <span className="text-xs text-muted">{hasUnsavedChanges ? "Unsaved changes" : ""}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">
              Step {displayedStepNumber} of {totalSteps}
            </span>
            <Button variant="outline" onClick={handlePrev}>
              Back
            </Button>
            <Button variant="project" onClick={handleNext} isDisabled={isNextButtonDisabled}>
              {isFinalStep ? "Create Sync" : "Continue"}
            </Button>
          </div>
        </SheetFooter>
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
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Sync Setup?"
        description="Your progress configuring this sync will be lost."
      />
    </FormProvider>
  );
};
