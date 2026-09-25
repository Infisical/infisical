import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { AppConnectionOptionContent } from "@app/components/app-connections";
import { createNotification } from "@app/components/notifications";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared";
import {
  Alert,
  AlertDescription,
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
  FieldLegend,
  FieldSet,
  Input,
  ProviderIcon,
  Toggle
} from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP, AWS_REGIONS } from "@app/helpers/appConnections";
import { useDiscardChangesGuard, usePopUp } from "@app/hooks";
import {
  useGetAgentVaultActivityLoggingSettings,
  useUpdateAgentVaultActivityLoggingSettings
} from "@app/hooks/api/agentVault";
import { TAgentVaultActivityLoggingSettings } from "@app/hooks/api/agentVault/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

const NO_CONNECTION = "none";
const CREATE_CONNECTION = "_create";

const AWS_CONNECTION = APP_CONNECTION_MAP[AppConnection.AWS];

const S3_BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

const buildSchema = (hasSavedBucket: boolean) =>
  z
    .object({
      enabled: z.boolean(),
      appConnectionId: z.string(),
      bucket: z.string().trim().max(255),
      region: z.string(),
      keyPrefix: z
        .string()
        .trim()
        .max(512, "At most 512 characters")
        .regex(/^[A-Za-z0-9!\-_.'()/]*$/, "Use only letters, numbers and ! - _ . ' ( ) /")
        .refine(
          (value) => value === "" || value.split("/").every(Boolean),
          "Use folder names separated by single slashes, with no slash at the start or end"
        )
        .refine(
          (value) => !value.split("/").some((segment) => segment === "." || segment === ".."),
          "Cannot use '.' or '..' as a folder name"
        )
    })
    .refine((values) => !values.enabled || values.appConnectionId !== NO_CONNECTION, {
      message: "Activity logging needs an AWS connection",
      path: ["appConnectionId"]
    })
    .superRefine((values, ctx) => {
      const { length } = values.bucket;
      if (length === 0 && hasSavedBucket) {
        ctx.addIssue({
          code: "custom",
          path: ["bucket"],
          message: "A bucket can be replaced, not removed"
        });
      } else if (length === 0 && values.enabled) {
        ctx.addIssue({
          code: "custom",
          path: ["bucket"],
          message: "Activity logging needs a bucket"
        });
      } else if (length > 0 && !S3_BUCKET_NAME.test(values.bucket)) {
        ctx.addIssue({
          code: "custom",
          path: ["bucket"],
          message:
            "Use 3 to 63 lowercase letters, numbers, dots or hyphens, starting and ending with a letter or number"
        });
      }
    });

type FormData = z.infer<ReturnType<typeof buildSchema>>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSaved: (settings: TAgentVaultActivityLoggingSettings) => void;
};

export const ActivityLoggingModal = ({ isOpen, onOpenChange, onSaved }: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { data: settings } = useGetAgentVaultActivityLoggingSettings();
  const { data: connections, isPending: isLoadingConnections } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id
  );
  const updateConfig = useUpdateAgentVaultActivityLoggingSettings();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addConnection"] as const);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({ resolver: zodResolver(buildSchema(Boolean(settings?.bucket))) });

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => onOpenChange(false) });

  useEffect(() => {
    if (!isOpen || !settings) return;

    reset({
      enabled: settings.bucket ? settings.enabled : true,
      appConnectionId: settings.appConnectionId ?? NO_CONNECTION,
      bucket: settings.bucket ?? "",
      region: settings.region ?? AWS_REGIONS[0].slug,
      keyPrefix: settings.keyPrefix ?? ""
    });
  }, [isOpen, settings, reset]);

  const bucket = watch("bucket") ?? "";
  const keyPrefix = watch("keyPrefix") ?? "";
  const isEnabled = watch("enabled");
  const isDetaching =
    watch("appConnectionId") === NO_CONNECTION && Boolean(settings?.appConnectionId);

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const connectionOptions = [
    ...(canCreateConnection ? [{ id: CREATE_CONNECTION, name: "Create New Connection" }] : []),
    ...(isEnabled ? [] : [{ id: NO_CONNECTION, name: "None" }]),
    ...(connections ?? [])
  ];

  const typedBucket = bucket.trim();
  const willRelocate =
    Boolean(settings?.bucket) &&
    ((S3_BUCKET_NAME.test(typedBucket) && typedBucket !== settings?.bucket) ||
      keyPrefix.trim() !== (settings?.keyPrefix ?? ""));

  const onSubmit = async (values: FormData) => {
    try {
      const result = await updateConfig.mutateAsync({
        enabled: values.enabled,
        appConnectionId: values.appConnectionId === NO_CONNECTION ? null : values.appConnectionId,
        bucket: values.bucket || undefined,
        region: values.region,
        keyPrefix: values.keyPrefix
      });
      createNotification({ text: "Activity logging settings saved", type: "success" });
      onOpenChange(false);
      onSaved(result);
    } catch {
      // MutationCache.onError already reports the failure.
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : requestDiscard())}>
      <DialogContent className="max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Activity Logging
              <DocumentationLinkBadge href={AgentVaultDocsUrls.activityLogs} />
            </DialogTitle>
            <DialogDescription>
              The bucket records are written to, and the credentials that reach it.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <FieldSet>
              <Controller
                control={control}
                name="enabled"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>Enable</FieldLabel>
                      <FieldDescription>
                        When enabled, requests made by the agents are saved to the bucket below.
                      </FieldDescription>
                    </FieldContent>
                    <Toggle
                      variant="av"
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Storage</FieldLegend>

              <Controller
                control={control}
                name="appConnectionId"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>AWS Connection</FieldLabel>
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
                        options={connectionOptions}
                        placeholder="Select a connection..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                        renderOption={(option) => (
                          <span className="flex min-w-0 items-center gap-2">
                            {option.id !== CREATE_CONNECTION && option.id !== NO_CONNECTION && (
                              <ProviderIcon
                                alt={`${AWS_CONNECTION.name} connection`}
                                icon={AWS_CONNECTION.image}
                                className="w-4 shrink-0"
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              {option.id === NO_CONNECTION ? (
                                option.name
                              ) : (
                                <AppConnectionOptionContent
                                  data={option}
                                  isOnlyOption={
                                    option.id === CREATE_CONNECTION &&
                                    connectionOptions.length === 1
                                  }
                                />
                              )}
                            </span>
                          </span>
                        )}
                        renderValue={(option) => (
                          <span className="flex min-w-0 items-center gap-2">
                            {option.id !== NO_CONNECTION && (
                              <ProviderIcon
                                alt={`${AWS_CONNECTION.name} connection`}
                                icon={AWS_CONNECTION.image}
                                className="w-4 shrink-0"
                              />
                            )}
                            <span className="truncate">{option.name}</span>
                          </span>
                        )}
                        modal
                      />
                      <FieldDescription>
                        {isDetaching
                          ? "Without a connection, recorded activity can't be read. The bucket is kept, so attaching a connection later brings the history back."
                          : "Its credentials write the records, and read them back when you open a session's activity."}
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
                      id="agent-vault-activity-region-label"
                      htmlFor="agent-vault-activity-region"
                    >
                      Region
                    </FieldLabel>
                    <FieldContent>
                      <AwsRegionSelect
                        id="agent-vault-activity-region"
                        value={field.value}
                        onChange={field.onChange}
                        isError={Boolean(fieldState.error)}
                        aria-labelledby="agent-vault-activity-region-label"
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
                          placeholder="acme-agent-vault-activity"
                          isError={Boolean(fieldState.error)}
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
                        />
                        <FieldDescription>
                          Every object is written under this prefix.
                        </FieldDescription>
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
              </div>

              {willRelocate && (
                <Alert variant="warning">
                  <AlertDescription>
                    <p>
                      Everything already recorded stays in{" "}
                      <span className="font-mono">{settings?.bucket}</span>, where Infisical can no
                      longer read it. To rotate credentials, update the AWS connection instead of
                      moving the bucket.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
            </FieldSet>
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

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your changes to the activity logging settings will be lost."
      />
    </Dialog>
  );
};
