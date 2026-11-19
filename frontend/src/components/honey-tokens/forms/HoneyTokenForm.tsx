import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  SheetFooter,
  Spinner,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { HONEY_TOKEN_DEFAULT_SECRET_NAMES, HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { isInfisicalCloud } from "@app/helpers/platform";
import {
  AlertChannelType,
  AlertEventType,
  AlertPrincipalType,
  AlertResourceType,
  TAlert,
  TChannelForm,
  toChannelForm,
  toChannelInput,
  useCreateAlert,
  useListAlerts,
  useUpdateAlert
} from "@app/hooks/api/alerts";
import { useListAwsHoneyTokenDeploymentOptions } from "@app/hooks/api/honeyToken";
import { useCreateHoneyToken, useUpdateHoneyToken } from "@app/hooks/api/honeyTokens";
import { HoneyTokenManagedBy, HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { fetchProjectSecrets } from "@app/hooks/api/secrets/queries";
import { buildNextChannel, DEFAULT_ALERT_NAMES } from "@app/views/Alerts";

import { canManageTriggerAlert, HoneyTokenAlertsFields } from "./HoneyTokenAlertsFields";
import { HoneyTokenConfigurationFields } from "./HoneyTokenConfigurationFields";
import { HoneyTokenDetailsFields } from "./HoneyTokenDetailsFields";
import { HoneyTokenMappingFields } from "./HoneyTokenMappingFields/HoneyTokenMappingFields";
import { HoneyTokenFormSchema, serializeTriggerAlertChannels, THoneyTokenForm } from "./schemas";

type Props = {
  onComplete: () => void;
  type: HoneyTokenType;
  onCancel: () => void;
  secretPath: string;
  environment?: string;
  environments?: ProjectEnv[];
  honeyToken?: TDashboardHoneyToken;
};

type ContentProps = Props & {
  triggerAlert?: TAlert;
  isTriggerAlertUnavailable: boolean;
};

type FormTab = {
  name: string;
  key: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  fields: (keyof THoneyTokenForm)[];
};

const FORM_TABS: FormTab[] = [
  {
    name: "Configuration",
    key: "configuration",
    shortDescription: "AWS account and environment",
    title: "Choose where to plant it",
    subtitle:
      "Choose the AWS account that holds the decoy credentials and the environment where Infisical stores them.",
    fields: ["managedBy", "environment"]
  },
  {
    name: "Mapping",
    key: "mapping",
    shortDescription: "Secret keys",
    title: "Map the generated credentials",
    subtitle: "Choose the secret keys that will receive each decoy credential field.",
    fields: ["secretsMapping"]
  },
  {
    name: "Details",
    key: "details",
    shortDescription: "Name and description",
    title: "Add honey token details",
    subtitle: "Give this honey token a clear name and an optional description.",
    fields: ["name", "description"]
  },
  {
    name: "Alerts",
    key: "alerts",
    shortDescription: "Trigger notifications",
    title: "Set up trigger alerts",
    subtitle:
      "Choose where Infisical sends a notice when someone uses this honey token. You can skip this step.",
    fields: ["isTriggerAlertEnabled", "channels"]
  }
];

const buildProjectAdminsChannel = (projectId: string): TChannelForm => ({
  ...buildNextChannel([], AlertChannelType.Email),
  recipients: [{ principalType: AlertPrincipalType.ProjectAdmins, principalId: projectId }]
});

const HoneyTokenFormContent = ({
  type,
  onComplete,
  onCancel,
  environment: envSlug,
  secretPath,
  environments,
  honeyToken,
  triggerAlert,
  isTriggerAlertUnavailable
}: ContentProps) => {
  const createHoneyToken = useCreateHoneyToken();
  const updateHoneyToken = useUpdateHoneyToken();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const { name: tokenTypeName } = HONEY_TOKEN_MAP[type];

  const isUpdate = Boolean(honeyToken);
  const {
    data: deploymentOptions,
    isError: isDeploymentOptionsError,
    isFetching: isFetchingDeploymentOptions,
    refetch: refetchDeploymentOptions
  } = useListAwsHoneyTokenDeploymentOptions({
    enabled: !isUpdate,
    // The setup page opens in a new tab, so returning here has to pick up the new setup status.
    refetchOnWindowFocus: "always"
  });
  const isDeploymentOptionAvailable = (managedBy: HoneyTokenManagedBy) =>
    Boolean(
      deploymentOptions?.some(
        (option) => option.managedBy === managedBy && !option.unavailableReason
      )
    );
  const formTabs = isUpdate ? FORM_TABS.filter((tab) => tab.key !== "configuration") : FORM_TABS;

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  // Fixed at open: a later refetch must not change what a save compares against, or saving an
  // unrelated change could write over alert changes made elsewhere.
  const [savedTriggerAlert] = useState(
    () =>
      triggerAlert && {
        id: triggerAlert.id,
        enabled: triggerAlert.enabled,
        channels: triggerAlert.channels.map(toChannelForm)
      }
  );

  const formMethods = useForm<THoneyTokenForm>({
    resolver: zodResolver(HoneyTokenFormSchema(savedTriggerAlert)),
    defaultValues: honeyToken
      ? {
          ...honeyToken,
          managedBy: honeyToken.config.managedBy,
          environment: currentProject?.environments.find(
            (env) => env.slug === honeyToken.environment.slug
          ),
          secretPath,
          isTriggerAlertEnabled: savedTriggerAlert?.enabled ?? false,
          channels: savedTriggerAlert?.channels ?? [buildProjectAdminsChannel(currentProject.id)]
        }
      : {
          type,
          environment: currentProject?.environments.find((env) => env.slug === envSlug),
          secretPath,
          secretsMapping: HONEY_TOKEN_DEFAULT_SECRET_NAMES[type],
          isTriggerAlertEnabled: true,
          channels: [buildProjectAdminsChannel(currentProject.id)]
        },
    reValidateMode: "onChange"
  });

  useEffect(() => {
    if (!deploymentOptions) return;
    formMethods.clearErrors("managedBy");
    if (formMethods.getFieldState("managedBy").isDirty) return;

    // An org that connected its own account most likely wants its tokens there. An unusable option is
    // left unselected, so the user opens the list and finds why it is disabled and how to set it up.
    if (isDeploymentOptionAvailable(HoneyTokenManagedBy.Organization)) {
      formMethods.setValue("managedBy", HoneyTokenManagedBy.Organization);
    } else if (isInfisicalCloud() && isDeploymentOptionAvailable(HoneyTokenManagedBy.Instance)) {
      formMethods.setValue("managedBy", HoneyTokenManagedBy.Instance);
    }
  }, [deploymentOptions]);

  const saveTriggerAlert = async (
    { honeyTokenId, projectId }: { honeyTokenId: string; projectId: string },
    isTriggerAlertEnabled: boolean,
    channels: TChannelForm[],
    canManage: boolean
  ) => {
    if (isTriggerAlertUnavailable || !canManage) return;

    if (savedTriggerAlert) {
      if (isTriggerAlertEnabled) {
        const hasChannelChanges =
          serializeTriggerAlertChannels(channels) !==
          serializeTriggerAlertChannels(savedTriggerAlert.channels);
        if (savedTriggerAlert.enabled && !hasChannelChanges) return;
        await updateAlert.mutateAsync({
          alertId: savedTriggerAlert.id,
          enabled: true,
          channels: channels.map(toChannelInput)
        });
      } else if (savedTriggerAlert.enabled) {
        await updateAlert.mutateAsync({ alertId: savedTriggerAlert.id, enabled: false });
      }
      return;
    }

    if (!isTriggerAlertEnabled) return;
    await createAlert.mutateAsync({
      name: DEFAULT_ALERT_NAMES[AlertEventType.HoneyTokenTriggered],
      resourceType: AlertResourceType.HoneyToken,
      resourceId: honeyTokenId,
      eventType: AlertEventType.HoneyTokenTriggered,
      projectId,
      enabled: true,
      condition: null,
      channels: channels.map(toChannelInput)
    });
  };

  const onSubmit = async ({
    environment,
    managedBy,
    isTriggerAlertEnabled,
    channels,
    ...formData
  }: THoneyTokenForm) => {
    const canManageAlert = canManageTriggerAlert(permission, {
      environment: environment?.slug,
      secretPath: formData.secretPath
    });
    // The honey token is saved either way, and MutationCache reports why an alert request failed.
    const saveAlertQuietly = (target: { honeyTokenId: string; projectId: string }) =>
      saveTriggerAlert(target, isTriggerAlertEnabled, channels, canManageAlert).catch(() => {});

    if (honeyToken) {
      await updateHoneyToken.mutateAsync({
        honeyTokenId: honeyToken.id,
        projectId: honeyToken.projectId,
        name: formData.name,
        description: formData.description,
        secretsMapping: formData.secretsMapping
      });
      await saveAlertQuietly({ honeyTokenId: honeyToken.id, projectId: honeyToken.projectId });

      createNotification({
        text: `Successfully updated ${tokenTypeName} Honey Token`,
        type: "success"
      });
    } else {
      const { honeyToken: createdHoneyToken, stackDeployment } = await createHoneyToken.mutateAsync(
        {
          ...formData,
          config: { managedBy },
          environment: environment.slug,
          projectId: currentProject.id
        }
      );
      await saveAlertQuietly({ honeyTokenId: createdHoneyToken.id, projectId: currentProject.id });

      if (stackDeployment && !stackDeployment.deployed) {
        const isDeploying = stackDeployment.status?.endsWith("_IN_PROGRESS");
        createNotification({
          text: isDeploying
            ? "Token was created, but stack is still deploying."
            : "Token was created, but stack is not deployed yet.",
          callToAction: (
            <Link
              className="inline-flex h-7 items-center rounded border border-border px-2 text-xs text-foreground transition-colors hover:bg-container-hover"
              to="/organizations/$orgId/projects/secret-management/product-settings"
              params={{ orgId: currentOrg.id }}
            >
              Go to settings
            </Link>
          ),
          type: "warning"
        });
      } else {
        createNotification({
          text: `Successfully created ${tokenTypeName} Honey Token`,
          type: "success"
        });
      }
    }
    onComplete();
  };

  const handlePrev = () => {
    if (selectedTabIndex === 0) {
      onCancel();
      return;
    }

    setSelectedTabIndex((prev) => prev - 1);
  };

  const {
    handleSubmit,
    trigger,
    formState: { isSubmitting }
  } = formMethods;

  const isStepValid = async (index: number) => {
    const isValid = await trigger(formTabs[index].fields);
    if (!isValid || formTabs[index].key !== "configuration") return isValid;

    // Without the options the form cannot tell whether the selected AWS account is usable.
    if (!deploymentOptions) {
      formMethods.setError("managedBy", {
        message: isDeploymentOptionsError
          ? "Couldn't load where this honey token can be created."
          : "Still loading where this honey token can be created. Try again in a moment."
      });
      return false;
    }

    if (
      formMethods.getValues("managedBy") === HoneyTokenManagedBy.Organization &&
      !isDeploymentOptionAvailable(HoneyTokenManagedBy.Organization)
    ) {
      formMethods.setError("managedBy", {
        message:
          isInfisicalCloud() && isDeploymentOptionAvailable(HoneyTokenManagedBy.Instance)
            ? "Finish connecting your AWS account, or choose Infisical Managed."
            : "Finish connecting your AWS account to create a honey token."
      });
      return false;
    }

    return true;
  };

  const isFinalStep = selectedTabIndex === formTabs.length - 1;

  const [isValidating, setIsValidating] = useState(false);

  const checkMappingConflicts = async (): Promise<boolean> => {
    const { environment, secretsMapping } = formMethods.getValues();
    if (!environment?.slug || !secretsMapping) return true;

    const mappingEntries = Object.entries(secretsMapping);
    const values = mappingEntries.map(([, v]) => v);

    if (new Set(values).size !== values.length) {
      formMethods.setError("secretsMapping", {
        message: "Secret mapping names must be unique."
      });
      return false;
    }

    try {
      setIsValidating(true);
      const data = await fetchProjectSecrets({
        projectId: currentProject.id,
        environment: environment.slug,
        secretPath
      });

      const ownKeys = honeyToken ? new Set(Object.values(honeyToken.secretsMapping)) : new Set();
      const existingKeys = new Set(data.secrets.map((s) => s.secretKey));
      const conflicts = values.filter((key) => existingKeys.has(key) && !ownKeys.has(key));

      if (conflicts.length > 0) {
        formMethods.setError("secretsMapping", {
          message: `The following secrets already exist in this path: ${conflicts.join(", ")}`
        });
        return false;
      }
    } catch {
      createNotification({
        text: "Failed to validate secret names. Please try again.",
        type: "error"
      });
      return false;
    } finally {
      setIsValidating(false);
    }

    return true;
  };

  const mappingStepIndex = formTabs.findIndex((tab) => tab.key === "mapping");

  const handleNext = async () => {
    if (isFinalStep) {
      handleSubmit(onSubmit)();
      return;
    }

    const isValid = await isStepValid(selectedTabIndex);

    if (!isValid) return;

    if (selectedTabIndex === mappingStepIndex && !isUpdate) {
      const noConflicts = await checkMappingConflicts();
      if (!noConflicts) return;
    }

    setSelectedTabIndex((prev) => prev + 1);
  };

  const isTabEnabled = async (index: number) => {
    let isEnabled = true;
    for (let i = index - 1; i >= 0; i -= 1) {
      // eslint-disable-next-line no-await-in-loop
      isEnabled = isEnabled && (await isStepValid(i));
    }

    return isEnabled;
  };

  const handleStepChange = (index: number) => {
    isTabEnabled(index).then((isEnabled) => {
      if (isEnabled) setSelectedTabIndex(index);
    });
  };

  const currentStep = formTabs[selectedTabIndex];

  const formFields = (
    <>
      {currentStep.key === "configuration" && (
        <HoneyTokenConfigurationFields
          environments={environments}
          deploymentOptions={deploymentOptions}
          isDeploymentOptionsError={isDeploymentOptionsError}
          isRetryingDeploymentOptions={isFetchingDeploymentOptions}
          onRetryDeploymentOptions={() => refetchDeploymentOptions()}
        />
      )}
      {currentStep.key === "mapping" && <HoneyTokenMappingFields />}
      {currentStep.key === "details" && <HoneyTokenDetailsFields isUpdate={isUpdate} />}
      {currentStep.key === "alerts" && (
        <HoneyTokenAlertsFields
          projectId={currentProject.id}
          honeyTokenId={honeyToken?.id}
          isAlertUnavailable={isTriggerAlertUnavailable}
        />
      )}
    </>
  );

  const displayedStepNumber = selectedTabIndex + 1;
  const totalSteps = formTabs.length;

  return (
    <FormProvider {...formMethods}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => event.preventDefault()}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="hidden w-60 shrink-0 flex-col border-r border-border px-5 py-6 md:flex">
            <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
              Setup steps
            </p>
            <Stepper
              activeStep={selectedTabIndex}
              orientation="vertical"
              onStepChange={handleStepChange}
              nonLinear
            >
              <StepperList aria-label="Honey token setup progress">
                {formTabs.map((tab, index) => (
                  <StepperStep
                    key={tab.key}
                    index={index}
                    title={tab.name}
                    description={tab.shortDescription}
                    disabled={isSubmitting || isValidating}
                  />
                ))}
              </StepperList>
            </Stepper>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <div className="border-b border-border px-4 py-4 md:hidden">
              <p className="text-xs font-medium text-muted">
                Step {displayedStepNumber} of {totalSteps}: {currentStep.name}
              </p>
            </div>
            <div className="flex w-full max-w-3xl flex-col gap-y-2 px-4 py-6 md:px-8">
              <div className="mb-6">
                <h2 className="text-lg font-normal text-foreground">{currentStep.title}</h2>
                <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
              </div>
              {formFields}
            </div>
          </div>
        </div>
      </form>
      <SheetFooter className="flex-col items-stretch border-t sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted">
          Step {displayedStepNumber} of {totalSteps}
        </span>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <Button className="w-full sm:w-fit" onClick={handlePrev} variant="outline">
            Back
          </Button>
          <Button
            onClick={handleNext}
            isPending={isSubmitting || isValidating}
            isDisabled={isSubmitting || isValidating}
            className="w-full sm:w-fit"
            variant="project"
          >
            {isFinalStep ? `${honeyToken ? "Update" : "Create"} Honey Token` : "Continue"}
          </Button>
        </div>
      </SheetFooter>
    </FormProvider>
  );
};

export const HoneyTokenForm = (props: Props) => {
  const { honeyToken } = props;
  const isEditMode = Boolean(honeyToken);

  const {
    data: alerts,
    isFetchedAfterMount,
    isError
  } = useListAlerts(
    {
      resourceType: AlertResourceType.HoneyToken,
      resourceId: honeyToken?.id,
      projectId: honeyToken?.projectId
    },
    // A cached list can predate a change made elsewhere, and the form starts from this read.
    { enabled: isEditMode, refetchOnMount: "always" }
  );

  // The alert goes into the default values rather than a later resetField, which ignores fields
  // that aren't registered yet, and the Alerts step mounts last.
  if (isEditMode && !isFetchedAfterMount) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading honey token" />
      </div>
    );
  }

  return (
    <HoneyTokenFormContent
      {...props}
      triggerAlert={alerts?.find((alert) => alert.eventType === AlertEventType.HoneyTokenTriggered)}
      isTriggerAlertUnavailable={isEditMode && isError}
    />
  );
};
