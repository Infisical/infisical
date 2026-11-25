import { useEffect, useState } from "react";
import { DefaultValues, FieldPath, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Loader,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { useProject, useProjectPermission } from "@app/context";
import {
  doesDataSourceSupportDiscovery,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import {
  AlertChannelType,
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
import {
  SecretScanningDataSource,
  TSecretScanningDataSource,
  useSecretScanningDataSourceOptions
} from "@app/hooks/api/secretScanningV2";
import {
  useCreateSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2/mutations";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";
import { buildNextChannel, DEFAULT_ALERT_NAMES } from "@app/views/Alerts";

import {
  buildSecretScanningDataSourceSchema,
  serializeAlertChannels,
  TDataSourceAlertField,
  TSecretScanningDataSourceForm
} from "./schemas";
import {
  canManageDataSourceAlerts,
  DATA_SOURCE_ALERTS,
  SecretScanningDataSourceAlertsFields
} from "./SecretScanningDataSourceAlertsFields";
import {
  SecretScanningDataSourceConnectionFields,
  SecretScanningDataSourceScanFields
} from "./SecretScanningDataSourceConfigFields";
import { SecretScanningDataSourceDetailsFields } from "./SecretScanningDataSourceDetailsFields";
import { SecretScanningDataSourceReviewFields } from "./SecretScanningDataSourceReviewFields";

type TFormField = FieldPath<TSecretScanningDataSourceForm>;

enum FormStep {
  Provider = 0,
  Connection = 1,
  Scan = 2,
  Details = 3,
  Alerts = 4,
  Review = 5
}

const getDefaultConfig = (type: SecretScanningDataSource) => {
  switch (type) {
    case SecretScanningDataSource.GitHub:
      return {};
    case SecretScanningDataSource.Bitbucket:
      return { workspaceSlug: "" };
    case SecretScanningDataSource.GitLab:
      return { scope: GitLabDataSourceScope.Account };
    default:
      throw new Error(`Unhandled data source type: ${type}`);
  }
};

const buildProjectAdminsChannel = (projectId: string): TChannelForm => ({
  ...buildNextChannel([], AlertChannelType.Email),
  recipients: [{ principalType: AlertPrincipalType.ProjectAdmins, principalId: projectId }]
});

// The same alerts a data source gets when its creator doesn't choose any.
const getDefaultAlertValues = (projectId: string) => ({
  secretsDetectedAlert: { enabled: true, channels: [buildProjectAdminsChannel(projectId)] },
  scanFailedAlert: { enabled: true, channels: [buildProjectAdminsChannel(projectId)] }
});

// An edit starts from each alert as it's saved. A deleted alert starts off, with the channel a new data
// source's alerts start with.
const getSavedAlerts = (alerts: TAlert[], projectId: string) => {
  const byField = Object.fromEntries(
    DATA_SOURCE_ALERTS.map(({ eventType, field }) => [
      field,
      alerts.find((alert) => alert.eventType === eventType)
    ])
  ) as Record<TDataSourceAlertField, TAlert | undefined>;

  const toFormValue = (alert?: TAlert) =>
    alert
      ? { enabled: alert.enabled, channels: alert.channels.map(toChannelForm) }
      : { enabled: false, channels: [buildProjectAdminsChannel(projectId)] };

  return {
    byField,
    values: {
      secretsDetectedAlert: toFormValue(byField.secretsDetectedAlert),
      scanFailedAlert: toFormValue(byField.scanFailedAlert)
    }
  };
};

const getDefaultValues = (type: SecretScanningDataSource, projectId: string) =>
  ({
    type,
    isHistoricalScanEnabled: true,
    isScanNewCommitsEnabled: true,
    isDiscoveryEnabled: doesDataSourceSupportDiscovery({
      type,
      config: getDefaultConfig(type)
    }),
    config: getDefaultConfig(type),
    ...getDefaultAlertValues(projectId)
  }) as DefaultValues<TSecretScanningDataSourceForm>;

const CONNECTION_STEP_FIELDS: Record<SecretScanningDataSource, TFormField[]> = {
  [SecretScanningDataSource.GitHub]: ["connection"],
  [SecretScanningDataSource.Bitbucket]: ["connection", "config.workspaceSlug"],
  [SecretScanningDataSource.GitLab]: [
    "connection",
    "config.scope",
    "config.projectId",
    "config.groupId"
  ]
};

const CONNECTION_STEP_INFO: Record<SecretScanningDataSource, string> = {
  [SecretScanningDataSource.GitHub]:
    "The App Connection is how Secret Scanning reads your GitHub repositories. It cannot be changed after the data source is created.",
  [SecretScanningDataSource.Bitbucket]:
    "The App Connection is how Secret Scanning reads your Bitbucket repositories, and the workspace tells it where to look. The connection cannot be changed after the data source is created.",
  [SecretScanningDataSource.GitLab]:
    "The App Connection is how Secret Scanning reads your GitLab projects. Without a group, the data source covers every project the connection can read. GitLab only reports new projects through group webhooks, so a group is required to discover them. Connection and group cannot be changed after the data source is created."
};

const getSteps = (type: SecretScanningDataSource, isEdit: boolean) => {
  const { name: platform } = SECRET_SCANNING_DATA_SOURCE_MAP[type];
  const { singularNoun, pluralNoun, verb } = RESOURCE_DESCRIPTION_HELPER[type];

  const steps = [
    {
      key: FormStep.Provider,
      name: "Provider",
      description: platform,
      title: "Choose a Provider",
      subtitle: "Pick the platform this data source will scan.",
      info: "",
      fields: [] as TFormField[]
    },
    {
      key: FormStep.Connection,
      name: "Connection",
      description: "Connection and scope",
      title: `Connect to ${platform}`,
      subtitle: isEdit
        ? "The App Connection and scope are fixed once the data source is created."
        : "Choose the App Connection and, if needed, narrow its scope.",
      info: CONNECTION_STEP_INFO[type],
      fields: CONNECTION_STEP_FIELDS[type]
    },
    {
      key: FormStep.Scan,
      name: "Scan Options",
      description: "Scan behavior",
      title: "Configure Scanning",
      subtitle: "Decide when this data source gets scanned.",
      info: `Historical scan checks existing history once ${pluralNoun} are enabled. Scan New Commits keeps watching each ${verb}. Discovery adds every ${singularNoun} the connection can access, including ones created later.`,
      fields: [
        "isHistoricalScanEnabled",
        "isScanNewCommitsEnabled",
        "isDiscoveryEnabled"
      ] as TFormField[]
    },
    {
      key: FormStep.Details,
      name: "Details",
      description: "Name and description",
      title: "Name This Data Source",
      subtitle: "Give the data source a name your team will recognize.",
      info: "This name appears in the data source list, in findings, and in audit logs.",
      fields: ["name", "description"] as TFormField[]
    },
    {
      key: FormStep.Alerts,
      name: "Alerts",
      description: "Notifications",
      title: "Set Up Alerts",
      subtitle: "Choose where Infisical sends a notice when a scan finds secrets or fails.",
      info: isEdit
        ? "Each alert has its own channels. Saving changes only what you changed here, and keeps the kinds of scans each alert skips."
        : "Infisical sends a notice to every channel when a scan finds secrets or fails. You can change these alerts later from the data source's settings.",
      fields: ["secretsDetectedAlert", "scanFailedAlert"] as TFormField[]
    },
    {
      key: FormStep.Review,
      name: "Review",
      description: "Confirm configuration",
      title: isEdit ? "Review and Save" : "Review and Create",
      subtitle: isEdit
        ? "Confirm the details below, then save your changes."
        : "Confirm the details below, then create the data source.",
      info: isEdit
        ? "Saving updates the data source right away. Changes to scan options apply to the next scan or commit."
        : "You can change scan options, name, description, and alerts later from the data source's settings.",
      fields: [] as TFormField[]
    }
  ];

  return steps;
};

const ProviderCard = ({
  type,
  onClick
}: {
  type: SecretScanningDataSource;
  onClick: () => void;
}) => {
  const { name, image } = SECRET_SCANNING_DATA_SOURCE_MAP[type];
  const { pluralNoun } = RESOURCE_DESCRIPTION_HELPER[type];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-hover/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-hover">
          <ProviderIcon icon={image} alt={`${name} logo`} className="h-6 w-6 object-contain" />
        </div>
        <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
          Version Control
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{name}</p>
        <p className="text-xs leading-relaxed text-muted">
          Scan {pluralNoun} hosted on {name} for leaked secrets.
        </p>
      </div>
    </button>
  );
};

const ProviderFields = ({ onSelect }: { onSelect: (type: SecretScanningDataSource) => void }) => {
  const { isPending, data: options } = useSecretScanningDataSourceOptions();

  if (isPending) return <Loader size="md" label="Loading data source options" />;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {options?.map(({ type }) => (
        <ProviderCard key={type} type={type} onClick={() => onSelect(type)} />
      ))}
    </div>
  );
};

type Props = {
  dataSource?: TSecretScanningDataSource;
  initialType?: SecretScanningDataSource;
  initialFormData?: Partial<TSecretScanningDataSourceForm>;
  onComplete: (dataSource: TSecretScanningDataSource) => void;
  onCancel: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
};

type ContentProps = Props & {
  alerts: TAlert[];
  isAlertsUnavailable: boolean;
};

const SecretScanningDataSourceFormContent = ({
  dataSource,
  initialType = SecretScanningDataSource.GitHub,
  initialFormData,
  onComplete,
  onCancel,
  onDirtyChange,
  onSubmittingChange,
  alerts,
  isAlertsUnavailable
}: ContentProps) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const createDataSource = useCreateSecretScanningDataSource();
  const updateDataSource = useUpdateSecretScanningDataSource();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();
  const isEdit = Boolean(dataSource);
  // Fixed at open: a later refetch must not change what a save compares against, or saving an unrelated
  // data source change could write over alert changes made elsewhere.
  const [savedAlerts] = useState(() =>
    getSavedAlerts(alerts, dataSource?.projectId ?? currentProject.id)
  );

  const [step, setStep] = useState(
    isEdit || initialFormData ? FormStep.Connection : FormStep.Provider
  );

  const formMethods = useForm<TSecretScanningDataSourceForm>({
    resolver: zodResolver(
      buildSecretScanningDataSourceSchema({
        secretsDetectedAlert:
          savedAlerts.byField.secretsDetectedAlert && savedAlerts.values.secretsDetectedAlert,
        scanFailedAlert: savedAlerts.byField.scanFailedAlert && savedAlerts.values.scanFailedAlert
      })
    ),
    defaultValues: (dataSource
      ? { ...dataSource, ...savedAlerts.values }
      : {
          ...getDefaultValues(initialType, currentProject.id),
          ...initialFormData
        }) as DefaultValues<TSecretScanningDataSourceForm>,
    // Step validation uses trigger(), which does not put the form into its submitted state.
    // Validate changes from the start so a field's error clears as soon as it is corrected.
    mode: "onChange",
    reValidateMode: "onChange"
  });

  const {
    control,
    handleSubmit,
    reset,
    trigger,
    formState: { isDirty, isSubmitting }
  } = formMethods;

  const type = useWatch({ control, name: "type" });
  const hasUnsavedChanges = isDirty || Boolean(initialFormData);

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
    return () => onDirtyChange(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
    return () => onSubmittingChange?.(false);
  }, [isSubmitting, onSubmittingChange]);

  const steps = getSteps(type, isEdit);
  const firstStep = isEdit ? FormStep.Connection : FormStep.Provider;
  const stepIndex = steps.findIndex((s) => s.key === step);
  const currentStep = steps[stepIndex];
  const isFinalStep = step === FormStep.Review;

  let submitLabel = "Continue";
  if (isFinalStep) submitLabel = isEdit ? "Save Changes" : "Create Data Source";

  const { name: platform, image } = SECRET_SCANNING_DATA_SOURCE_MAP[type];
  const { pluralNoun } = RESOURCE_DESCRIPTION_HELPER[type];

  // Each alert is saved on its own, and only what changed is sent, so anything else on it, such as the scans
  // it skips, stays as it is.
  const saveEditedAlerts = async (
    { id: dataSourceId, projectId }: TSecretScanningDataSource,
    values: Pick<TSecretScanningDataSourceForm, TDataSourceAlertField>
  ) => {
    if (isAlertsUnavailable || !canManageDataSourceAlerts(permission)) return;

    await Promise.all(
      DATA_SOURCE_ALERTS.map(async ({ eventType, field }) => {
        const { enabled, channels } = values[field];
        const saved = savedAlerts.byField[field];

        if (saved) {
          const savedValue = savedAlerts.values[field];
          const hasChannelChanges =
            enabled &&
            serializeAlertChannels(channels) !== serializeAlertChannels(savedValue.channels);
          if (enabled === saved.enabled && !hasChannelChanges) return;
          await updateAlert.mutateAsync({
            alertId: saved.id,
            enabled,
            ...(hasChannelChanges && { channels: channels.map(toChannelInput) })
          });
          return;
        }

        if (!enabled) return;
        await createAlert.mutateAsync({
          name: DEFAULT_ALERT_NAMES[eventType],
          resourceType: AlertResourceType.SecretScanning,
          resourceId: dataSourceId,
          eventType,
          projectId,
          enabled: true,
          condition: null,
          channels: channels.map(toChannelInput)
        });
      })
    );
  };

  const onSubmit = async ({
    connection,
    secretsDetectedAlert,
    scanFailedAlert,
    ...formData
  }: TSecretScanningDataSourceForm) => {
    const isDiscoveryEnabled =
      formData.isDiscoveryEnabled && doesDataSourceSupportDiscovery(formData);
    const alertValues = { secretsDetectedAlert, scanFailedAlert };

    if (dataSource) {
      const updated = await updateDataSource.mutateAsync({
        type: dataSource.type,
        dataSourceId: dataSource.id,
        projectId: dataSource.projectId,
        name: formData.name,
        description: formData.description,
        config: formData.config,
        isHistoricalScanEnabled: formData.isHistoricalScanEnabled,
        isScanNewCommitsEnabled: formData.isScanNewCommitsEnabled,
        isDiscoveryEnabled
      });

      try {
        await saveEditedAlerts(updated, alertValues);
      } catch {
        // MutationCache reports why an alert request failed. The data source itself is saved either way.
      }

      createNotification({
        text: `${platform} data source "${updated.name}" updated`,
        type: "success"
      });
      onComplete(updated);
      return;
    }

    const created = await createDataSource.mutateAsync({
      ...formData,
      isDiscoveryEnabled,
      connectionId: connection?.id,
      projectId: currentProject.id,
      // Without permission to choose alerts, the backend gives the data source its default alerts.
      ...(canManageDataSourceAlerts(permission) && {
        alerts: DATA_SOURCE_ALERTS.filter(({ field }) => alertValues[field].enabled).map(
          ({ eventType, field }) => ({
            eventType,
            channels: alertValues[field].channels.map(toChannelInput)
          })
        )
      })
    });

    createNotification({
      text: `${platform} data source "${created.name}" created`,
      type: "success"
    });
    onComplete(created);
  };

  const handleNext = async () => {
    if (isFinalStep) {
      await handleSubmit(onSubmit)();
      return;
    }

    if (!(await trigger(currentStep.fields))) return;

    setStep(steps[stepIndex + 1].key);
  };

  const handleBack = () => {
    if (step === firstStep) {
      onCancel();
      return;
    }

    setStep(steps[stepIndex - 1].key);
  };

  return (
    <FormProvider {...formMethods}>
      <SheetHeader>
        <div className="flex items-start gap-3">
          <ProviderIcon icon={image} alt="" className="size-9 object-contain" />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <SheetTitle>{platform} Data Source</SheetTitle>
              <DocumentationLinkBadge
                href={`https://infisical.com/docs/documentation/platform/secret-scanning/${type}`}
              />
            </div>
            <SheetDescription>
              {dataSource
                ? `Edit the scan options, details, and alerts of "${dataSource.name}".`
                : `Connect a ${platform} data source to scan its ${pluralNoun}.`}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <form
        className="flex min-h-0 flex-1 overflow-hidden"
        onSubmit={(e) => {
          e.preventDefault();
          handleNext();
        }}
        id="secret-scanning-data-source-form"
      >
        {step !== FormStep.Provider && (
          <aside className="hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-5 md:flex">
            <p className="text-xs font-medium tracking-wider text-muted uppercase">
              {isEdit ? "Steps" : "Setup Steps"}
            </p>
            <Stepper activeStep={stepIndex} onStepChange={(index) => setStep(steps[index].key)}>
              <StepperList>
                {steps.map((s, index) => (
                  <StepperStep
                    key={s.name}
                    index={index}
                    title={s.name}
                    description={s.description}
                    disabled={isEdit && s.key === FormStep.Provider}
                  />
                ))}
              </StepperList>
            </Stepper>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg text-foreground">{currentStep.title}</h3>
            <p className="text-sm text-accent">{currentStep.subtitle}</p>
          </div>

          {step === FormStep.Provider && (
            <ProviderFields
              onSelect={(newType) => {
                if (newType !== type) reset(getDefaultValues(newType, currentProject.id));
                setStep(FormStep.Connection);
              }}
            />
          )}
          {step === FormStep.Connection && <SecretScanningDataSourceConnectionFields />}
          {step === FormStep.Scan && <SecretScanningDataSourceScanFields />}
          {step === FormStep.Details && <SecretScanningDataSourceDetailsFields />}
          {step === FormStep.Alerts && (
            <SecretScanningDataSourceAlertsFields
              projectId={dataSource?.projectId ?? currentProject.id}
              dataSourceId={dataSource?.id}
              isAlertsUnavailable={isAlertsUnavailable}
            />
          )}
          {step === FormStep.Review && (
            <SecretScanningDataSourceReviewFields
              isEdit={isEdit}
              isAlertsUnavailable={isAlertsUnavailable}
            />
          )}
        </div>

        {step !== FormStep.Provider && (
          <aside className="hidden w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-5 lg:flex">
            <p className="text-xs font-medium tracking-wider text-muted uppercase">
              Step {stepIndex + 1} · {currentStep.name}
            </p>
            <p className="text-sm font-medium text-foreground">What this step does</p>
            <p className="text-sm leading-relaxed text-accent">{currentStep.info}</p>
          </aside>
        )}
      </form>

      <SheetFooter className="items-center justify-between border-t">
        <span className="text-xs text-muted">
          Step {stepIndex + 1} of {steps.length}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBack} isDisabled={isSubmitting}>
            {step === firstStep ? "Cancel" : "Back"}
          </Button>
          {step !== FormStep.Provider && (
            <Button
              variant="ss"
              type="submit"
              form="secret-scanning-data-source-form"
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              {submitLabel}
            </Button>
          )}
        </div>
      </SheetFooter>
    </FormProvider>
  );
};

export const SecretScanningDataSourceForm = (props: Props) => {
  const { dataSource } = props;
  const isEdit = Boolean(dataSource);

  const {
    data: alerts = [],
    isFetchedAfterMount,
    isError
  } = useListAlerts(
    {
      resourceType: AlertResourceType.SecretScanning,
      resourceId: dataSource?.id,
      projectId: dataSource?.projectId
    },
    // A cached list can predate a change made elsewhere, and the form starts from this read.
    { enabled: isEdit, refetchOnMount: "always" }
  );

  // The alerts go into the default values rather than a later resetField, which ignores fields that aren't
  // registered yet, and the Alerts step mounts near the end.
  if (isEdit && !isFetchedAfterMount) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading data source" />
      </div>
    );
  }

  return (
    <SecretScanningDataSourceFormContent
      {...props}
      alerts={alerts}
      isAlertsUnavailable={isEdit && isError}
    />
  );
};
