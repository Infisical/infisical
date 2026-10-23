import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CloudIcon, TriangleAlertIcon } from "lucide-react";

import { AgentVaultSessionLogUpgradeModal } from "@app/components/agent-vault/AgentVaultSessionLogUpgradeModal";
import { AppConnectionOptionContent } from "@app/components/app-connections";
import { createNotification } from "@app/components/notifications";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  Input,
  Label,
  ProviderIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
} from "@app/components/v3";
import {
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import {
  canTurnOnAgentVaultSessionLogs,
  getAgentVaultSessionLogRetentionDays,
  isAgentVaultSessionLogBlockedByPlan,
  isAgentVaultSessionLogStorageOnPlan
} from "@app/helpers/agentVaultSessionLogs";
import { APP_CONNECTION_MAP, AWS_REGIONS } from "@app/helpers/appConnections";
import { useDiscardChangesGuard, usePopUp } from "@app/hooks";
import {
  useGetAgentVaultSessionLogSettings,
  useUpdateAgentVaultSessionLogSettings
} from "@app/hooks/api/agentVault";
import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import {
  TAgentVaultSessionLogSettings,
  TUpdateAgentVaultSessionLogSettingsDTO
} from "@app/hooks/api/agentVault/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";
import { AwsSetupDialog } from "./AwsSetupDialog";
import {
  buildSessionLogSchema,
  needsSessionLogUpgrade,
  S3_BUCKET_NAME,
  toStorage,
  TSessionLogFormValues
} from "./SessionLogModal.utils";

const CREATE_CONNECTION = "_create";

const AWS_CONNECTION = APP_CONNECTION_MAP[AppConnection.AWS];

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSaved: (settings: TAgentVaultSessionLogSettings | null) => void;
  onEditCredentials?: () => void;
};

export const SessionLogModal = ({ isOpen, onOpenChange, onSaved, onEditCredentials }: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { data: state } = useGetAgentVaultSessionLogSettings();
  const settings = state?.settings ?? null;
  const isDefaultStorageConfigured = Boolean(state?.defaultStorage.configured);
  const { data: connections, isPending: isLoadingConnections } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id
  );
  const updateConfig = useUpdateAgentVaultSessionLogSettings();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addConnection",
    "awsSetup"
  ] as const);
  const [upgradeFor, setUpgradeFor] = useState<AgentVaultSessionLogStorageType | null>(null);
  const [isConfirmOffOpen, setIsConfirmOffOpen] = useState(false);

  const retentionDays = getAgentVaultSessionLogRetentionDays(subscription);
  const isOnPlan = (type: AgentVaultSessionLogStorageType) =>
    isAgentVaultSessionLogStorageOnPlan(type, subscription);
  const savedExternal =
    settings?.storage.type === AgentVaultSessionLogStorageType.External ? settings.storage : null;
  // Without the plan and with nothing saved, the bucket fields could never be saved, so they aren't shown.
  const isExternalUsable =
    isOnPlan(AgentVaultSessionLogStorageType.External) || Boolean(savedExternal);
  const isDefaultUsable =
    isDefaultStorageConfigured && isOnPlan(AgentVaultSessionLogStorageType.Default);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting, isDirty }
  } = useForm<TSessionLogFormValues>({
    resolver: zodResolver(buildSessionLogSchema(settings, isExternalUsable))
  });

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => onOpenChange(false) });

  useEffect(() => {
    if (!isOpen || !state) return;

    const saved = state.settings;
    const external =
      saved?.storage.type === AgentVaultSessionLogStorageType.External ? saved.storage : null;
    // While on, the dialog opens on the storage in use, even one the plan leaves out, so it matches the card and the
    // plan warning. An off row holds default storage without anyone picking it, so off starts on what the plan allows.
    const unchosenStorageType = isDefaultUsable
      ? AgentVaultSessionLogStorageType.Default
      : AgentVaultSessionLogStorageType.External;
    reset({
      enabled: saved?.enabled ?? false,
      storageType: saved?.enabled ? saved.storage.type : unchosenStorageType,
      appConnectionId: external?.appConnectionId ?? "",
      bucket: external?.bucket ?? "",
      region: external?.region ?? AWS_REGIONS[0].slug,
      keyPrefix: external?.keyPrefix ?? ""
    });
  }, [isOpen, state, reset, isDefaultUsable]);

  const bucket = watch("bucket") ?? "";
  const keyPrefix = watch("keyPrefix") ?? "";
  const storageType = watch("storageType");
  const isEnabled = watch("enabled");
  const isExternal = storageType === AgentVaultSessionLogStorageType.External;

  // The saved bucket stays visible after the plan lapses, but only turning off or switching is allowed.
  const isExternalReadOnly =
    Boolean(savedExternal) && !isOnPlan(AgentVaultSessionLogStorageType.External);
  const isBlockedByPlan = isAgentVaultSessionLogBlockedByPlan(settings, subscription);
  const canTurnOn = canTurnOnAgentVaultSessionLogs(isDefaultStorageConfigured, subscription);

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const connectionOptions = [
    ...(canCreateConnection && !isExternalReadOnly
      ? [{ id: CREATE_CONNECTION, name: "Create New Connection" }]
      : []),
    ...(connections ?? [])
  ];

  const typedBucket = bucket.trim();
  const isBucketChange =
    isExternal &&
    Boolean(savedExternal) &&
    S3_BUCKET_NAME.test(typedBucket) &&
    typedBucket !== savedExternal?.bucket;
  const isPrefixOnlyChange =
    isExternal &&
    Boolean(savedExternal) &&
    !isBucketChange &&
    keyPrefix.trim() !== (savedExternal?.keyPrefix ?? "");
  const isRecording = Boolean(settings?.enabled && isOnPlan(settings.storage.type));
  const isSwitchingStorage = isRecording && storageType !== settings?.storage.type;

  const saveSettings = async (request: TUpdateAgentVaultSessionLogSettingsDTO) => {
    try {
      const result = await updateConfig.mutateAsync(request);
      createNotification({ text: "Session log settings saved", type: "success" });
      setIsConfirmOffOpen(false);
      onOpenChange(false);
      onSaved(result.settings);
    } catch {
      // MutationCache.onError already reports the failure.
    }
  };

  const onSubmit = async (values: TSessionLogFormValues) => {
    // Turning off forgets the storage, and an external bucket is easy to lose track of, so that one is confirmed.
    if (!values.enabled) {
      if (savedExternal) {
        setIsConfirmOffOpen(true);
        return;
      }
      await saveSettings({ enabled: false });
      return;
    }

    if (needsSessionLogUpgrade(values, settings, isOnPlan)) {
      setUpgradeFor(values.storageType);
      return;
    }
    await saveSettings({ enabled: true, storage: toStorage(values) });
  };

  // Both are always listed so they can be found. Default storage the instance hasn't set up can't be picked; one the
  // plan leaves out opens the upgrade instead.
  const storageOptions = [
    {
      type: AgentVaultSessionLogStorageType.Default,
      title: "Default storage",
      icon: <CloudIcon />,
      isUnavailable: !isDefaultStorageConfigured,
      description: isDefaultStorageConfigured
        ? `Kept ${retentionDays} days. Nothing to set up.`
        : "Not set up on this instance. Contact your server administrator."
    },
    {
      type: AgentVaultSessionLogStorageType.External,
      title: "External storage",
      icon: (
        <ProviderIcon
          alt={`${AWS_CONNECTION.name} connection`}
          icon={AWS_CONNECTION.image}
          className="w-4"
        />
      ),
      isUnavailable: false,
      description: "Your own S3 bucket. You keep logs as long as you like."
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : requestDiscard())}>
      <DialogContent className="max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Session Logs
              <DocumentationLinkBadge href={AgentVaultDocsUrls.sessionLogs} />
            </DialogTitle>
            <DialogDescription>Choose where to record what your agents do.</DialogDescription>
          </DialogHeader>

          {isBlockedByPlan &&
            settings?.storage.type === AgentVaultSessionLogStorageType.Default && (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertDescription>
                  <p>
                    Your plan doesn&apos;t include default storage, so session logs aren&apos;t
                    being recorded. Upgrade to record and view them. You can turn session logs off
                    {isOnPlan(AgentVaultSessionLogStorageType.External)
                      ? ", or switch to external storage."
                      : "."}
                  </p>
                  <AlertAction>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setUpgradeFor(AgentVaultSessionLogStorageType.Default)}
                    >
                      Upgrade
                    </Button>
                  </AlertAction>
                </AlertDescription>
              </Alert>
            )}
          {isBlockedByPlan && savedExternal && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                <p>
                  Your plan no longer includes external storage. Upgrade to see recorded logs and
                  keep recording. Recorded logs stay in your bucket. You can turn session logs off
                  {isDefaultUsable ? ", or switch to default storage." : "."}
                </p>
                <AlertAction>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setUpgradeFor(AgentVaultSessionLogStorageType.External)}
                  >
                    Upgrade
                  </Button>
                </AlertAction>
              </AlertDescription>
            </Alert>
          )}

          <FieldGroup>
            <FieldSet>
              <Controller
                control={control}
                name="enabled"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="agent-vault-session-log-enabled">Enable</Label>
                      <FieldDescription>Records every request your agents make.</FieldDescription>
                    </FieldContent>
                    <Toggle
                      id="agent-vault-session-log-enabled"
                      variant="av"
                      checked={field.value ?? false}
                      onCheckedChange={(checked) => {
                        if (checked && !canTurnOn) {
                          setUpgradeFor(
                            isDefaultStorageConfigured
                              ? AgentVaultSessionLogStorageType.Default
                              : AgentVaultSessionLogStorageType.External
                          );
                          return;
                        }
                        field.onChange(checked);
                      }}
                    />
                  </Field>
                )}
              />
            </FieldSet>

            {isEnabled && (
              <FieldSet>
                <Controller
                  control={control}
                  name="storageType"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="agent-vault-session-log-storage">Storage</FieldLabel>
                      <Select
                        value={
                          isOnPlan(field.value) ||
                          (settings?.enabled && settings.storage.type === field.value)
                            ? field.value
                            : ""
                        }
                        onValueChange={(value) => {
                          const type = value as AgentVaultSessionLogStorageType;
                          if (!isOnPlan(type)) {
                            setUpgradeFor(type);
                            return;
                          }
                          field.onChange(type);
                        }}
                      >
                        <SelectTrigger id="agent-vault-session-log-storage" className="w-full">
                          <SelectValue placeholder="Choose where to store session logs" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {storageOptions.map((option) => (
                            <SelectItem
                              key={option.type}
                              value={option.type}
                              disabled={option.isUnavailable}
                              description={<span className="pl-6">{option.description}</span>}
                            >
                              <span className="flex items-center gap-2">
                                {option.icon}
                                {option.title}
                                {!option.isUnavailable && !isOnPlan(option.type) && (
                                  <Badge variant="av">Upgrade</Badge>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />

                {isExternal && isExternalUsable && (
                  <>
                    <Controller
                      control={control}
                      name="appConnectionId"
                      render={({ field, fieldState }) => (
                        <Field>
                          <div className="flex items-center justify-between gap-2">
                            <FieldLabel>AWS Connection</FieldLabel>
                            <Button
                              variant="link"
                              size="xs"
                              type="button"
                              onClick={() => handlePopUpOpen("awsSetup")}
                            >
                              View AWS Setup
                            </Button>
                          </div>
                          <FieldContent>
                            <Combobox
                              value={connectionOptions.find((option) => option.id === field.value)}
                              isClearable={false}
                              onValueChange={(option) => {
                                if (option.id === CREATE_CONNECTION) {
                                  handlePopUpOpen("addConnection");
                                  return;
                                }
                                field.onChange(option.id);
                              }}
                              isLoading={isLoadingConnections}
                              isError={Boolean(fieldState.error)}
                              isDisabled={isExternalReadOnly}
                              options={connectionOptions}
                              placeholder="Select a connection..."
                              getOptionLabel={(option) => option.name}
                              getOptionValue={(option) => option.id}
                              renderOption={(option) => (
                                <span className="flex min-w-0 items-center gap-2">
                                  {option.id !== CREATE_CONNECTION && (
                                    <ProviderIcon
                                      alt={`${AWS_CONNECTION.name} connection`}
                                      icon={AWS_CONNECTION.image}
                                      className="w-4 shrink-0"
                                    />
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <AppConnectionOptionContent
                                      data={option}
                                      isOnlyOption={
                                        option.id === CREATE_CONNECTION &&
                                        connectionOptions.length === 1
                                      }
                                    />
                                  </span>
                                </span>
                              )}
                              renderValue={(option) => (
                                <span className="flex min-w-0 items-center gap-2">
                                  <ProviderIcon
                                    alt={`${AWS_CONNECTION.name} connection`}
                                    icon={AWS_CONNECTION.image}
                                    className="w-4 shrink-0"
                                  />
                                  <span className="truncate">{option.name}</span>
                                </span>
                              )}
                              modal
                            />
                            <FieldDescription>
                              Its credentials write the records, and read them back when you open a
                              session&apos;s logs.
                            </FieldDescription>
                            <FieldError>{fieldState.error?.message}</FieldError>
                          </FieldContent>
                        </Field>
                      )}
                    />

                    <Controller
                      control={control}
                      name="region"
                      render={({ field, fieldState }) => (
                        <Field>
                          <FieldLabel
                            id="agent-vault-session-log-region-label"
                            htmlFor="agent-vault-session-log-region"
                          >
                            Region
                          </FieldLabel>
                          <FieldContent>
                            <AwsRegionSelect
                              id="agent-vault-session-log-region"
                              value={field.value}
                              onChange={field.onChange}
                              isError={Boolean(fieldState.error)}
                              isDisabled={isExternalReadOnly}
                              aria-labelledby="agent-vault-session-log-region-label"
                            />
                            <FieldError>{fieldState.error?.message}</FieldError>
                          </FieldContent>
                        </Field>
                      )}
                    />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Controller
                        control={control}
                        name="bucket"
                        render={({ field, fieldState }) => (
                          <Field>
                            <FieldLabel>Bucket</FieldLabel>
                            <FieldContent>
                              <Input
                                {...field}
                                placeholder="acme-agent-vault-session-logs"
                                isError={Boolean(fieldState.error)}
                                disabled={isExternalReadOnly}
                              />
                              <FieldError>{fieldState.error?.message}</FieldError>
                            </FieldContent>
                          </Field>
                        )}
                      />
                      <Controller
                        control={control}
                        name="keyPrefix"
                        render={({ field, fieldState }) => (
                          <Field>
                            <FieldLabel>
                              Key Prefix <span className="text-muted">(optional)</span>
                            </FieldLabel>
                            <FieldContent>
                              <Input
                                {...field}
                                placeholder="agent-vault"
                                isError={Boolean(fieldState.error)}
                                disabled={isExternalReadOnly}
                              />
                              <FieldDescription>
                                Session logs are written under this prefix.
                              </FieldDescription>
                              <FieldError>{fieldState.error?.message}</FieldError>
                            </FieldContent>
                          </Field>
                        )}
                      />
                    </div>
                  </>
                )}

                {isSwitchingStorage && (
                  <Alert variant="warning">
                    <TriangleAlertIcon />
                    <AlertDescription>
                      {settings?.storage.type === AgentVaultSessionLogStorageType.Default
                        ? `Logs in default storage won't show after switching, and keep their ${retentionDays}-day retention.`
                        : "Logs in your bucket won't show after switching. They stay in the bucket."}
                    </AlertDescription>
                  </Alert>
                )}

                {!isSwitchingStorage && isBucketChange && (
                  <Alert variant="warning">
                    <AlertDescription>
                      <p>
                        Everything already recorded stays in{" "}
                        <span className="font-mono">{savedExternal?.bucket}</span> and won&apos;t
                        show in Infisical until you switch back to it. To rotate credentials, update
                        the AWS connection instead of moving the bucket.
                      </p>
                      {onEditCredentials && (
                        <AlertAction>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={onEditCredentials}
                          >
                            Edit AWS Credentials
                          </Button>
                        </AlertAction>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {!isSwitchingStorage && isPrefixOnlyChange && (
                  <Alert variant="info">
                    <AlertDescription>
                      Older logs won&apos;t show until you change the prefix back.
                    </AlertDescription>
                  </Alert>
                )}
              </FieldSet>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => requestDiscard()}>
              Cancel
            </Button>
            <Button type="submit" variant="av" isPending={isSubmitting} isDisabled={isSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isModalOpen) => handlePopUpToggle("addConnection", isModalOpen)}
        projectType={currentProject.type}
        projectId={currentProject.id}
        app={AppConnection.AWS}
        onComplete={(connection) => {
          if (connection) {
            setValue("appConnectionId", connection.id, { shouldValidate: true, shouldDirty: true });
          }
        }}
      />

      <AwsSetupDialog
        isOpen={popUp.awsSetup.isOpen}
        onOpenChange={(isSetupOpen) => handlePopUpToggle("awsSetup", isSetupOpen)}
        bucket={bucket.trim()}
        keyPrefix={keyPrefix.trim()}
        isUnsaved
      />

      <AgentVaultSessionLogUpgradeModal
        isOpen={upgradeFor !== null}
        onOpenChange={(open) => !open && setUpgradeFor(null)}
        storageType={upgradeFor ?? undefined}
      />

      <AlertDialog
        open={isConfirmOffOpen}
        onOpenChange={(open) => !updateConfig.isPending && setIsConfirmOffOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn Off Session Logs?</AlertDialogTitle>
            <AlertDialogDescription>
              Turning off forgets <span className="font-mono">{savedExternal?.bucket}</span>. To see
              its logs again, set up the same bucket and prefix.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={updateConfig.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              isPending={updateConfig.isPending}
              onClick={(event) => {
                event.preventDefault();
                saveSettings({ enabled: false }).catch(() => undefined);
              }}
            >
              Turn Off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your changes to the session log settings will be lost."
      />
    </Dialog>
  );
};
