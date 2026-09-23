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
  useGetAgentVaultActivityConfig,
  useUpdateAgentVaultActivityConfig
} from "@app/hooks/api/agentVault";
import { TAgentVaultActivityConfigResponse } from "@app/hooks/api/agentVault/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

const NO_CONNECTION = "none";
const CREATE_CONNECTION = "_create";

// AWS is the only app type Agent Vault allows, so the mark is fixed rather than looked up per option.
const AWS_CONNECTION = APP_CONNECTION_MAP[AppConnection.AWS];

/** Mirrors the server's normalisation, so "a", "/a" and "a/" are not read as three different prefixes. */
const normalizePrefix = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/` : "";
};

// Built per saved state: a bucket already saved can be replaced but not cleared, since the API has no way
// to remove one and an empty field would otherwise save as "keep the old one".
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
        .regex(/^[A-Za-z0-9!\-_.*'()/]*$/, "Use only letters, numbers and ! - _ . * ' ( ) /")
        .refine((value) => !value.split("/").includes(".."), "Cannot contain '..'")
        .refine(
          (value) => normalizePrefix(value).length <= 512,
          "At most 512 characters, including the trailing slash"
        )
    })
    .refine((values) => !values.enabled || values.appConnectionId !== NO_CONNECTION, {
      message: "Recording needs an AWS connection",
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
        ctx.addIssue({ code: "custom", path: ["bucket"], message: "Recording needs a bucket" });
      } else if (length > 0 && length < 3) {
        ctx.addIssue({
          code: "custom",
          path: ["bucket"],
          message: "Bucket names are at least 3 characters"
        });
      }
    });

type FormData = z.infer<ReturnType<typeof buildSchema>>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSaved: (result: TAgentVaultActivityConfigResponse, isCorsMissing: boolean) => void;
};

export const ActivityLoggingModal = ({ isOpen, onOpenChange, onSaved }: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { data } = useGetAgentVaultActivityConfig();
  const { data: connections, isPending: isLoadingConnections } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id
  );
  const updateConfig = useUpdateAgentVaultActivityConfig();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addConnection"] as const);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({ resolver: zodResolver(buildSchema(Boolean(data?.config.bucket))) });

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => onOpenChange(false) });

  useEffect(() => {
    if (!isOpen || !data) return;

    reset({
      // On a first setup, on. Somebody opening this to name a bucket means to record into it, and
      // a form that saves a complete destination with recording silently off is a trap. An existing
      // config keeps whatever it was set to.
      enabled: data.config.bucket ? data.config.enabled : true,
      appConnectionId: data.config.appConnectionId ?? NO_CONNECTION,
      bucket: data.config.bucket ?? "",
      region: data.config.region ?? AWS_REGIONS[0].slug,
      keyPrefix: data.config.keyPrefix ?? ""
    });
  }, [isOpen, data, reset]);

  const bucket = watch("bucket") ?? "";
  const keyPrefix = watch("keyPrefix") ?? "";
  const isEnabled = watch("enabled");
  const isDetaching =
    watch("appConnectionId") === NO_CONNECTION && Boolean(data?.config.appConnectionId);

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  // The create entry is a sentinel option rather than a button beside the field, matching every
  // other product's connection picker.
  // None only while recording is off: detaching is how a connection in use is freed for deletion,
  // and recording cannot run without one.
  const connectionOptions = [
    ...(canCreateConnection ? [{ id: CREATE_CONNECTION, name: "Create New Connection" }] : []),
    ...(isEnabled ? [] : [{ id: NO_CONNECTION, name: "None" }]),
    ...(connections ?? [])
  ];

  // Only the bucket and the prefix decide where an object lives, so only a change to one of those
  // strands what is already recorded. Warning on a first setup, or on a change of connection or
  // region, is noise that trains people to skip the warning that matters.
  // Only once a real bucket name is typed: a field mid-edit, or one being cleared, moves nothing.
  const typedBucket = bucket.trim();
  const willRelocate =
    Boolean(data?.config.bucket) &&
    ((typedBucket.length >= 3 && typedBucket !== data?.config.bucket) ||
      normalizePrefix(keyPrefix) !== normalizePrefix(data?.config.keyPrefix));

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

      // A save is the one moment the CORS rule is worth checking: the destination just changed and
      // the server cannot see the rule. The probe points at an object that is never written, since
      // S3 answers a matching rule with the CORS headers even on a 404 and fetch rejects only when
      // the rule is absent.
      let isCorsMissing = false;
      if (result.corsProbeUrl) {
        try {
          await fetch(result.corsProbeUrl, { mode: "cors", credentials: "omit" });
        } catch {
          isCorsMissing = true;
        }
      }

      onSaved(result, isCorsMissing);
    } catch {
      // MutationCache.onError already reports the failure; a second toast would duplicate it.
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
            {/* Its own FieldSet, peer to Storage below. Whether to record at all is the bigger of
                the two decisions, and as a loose field it read as a footnote to its destination. */}
            <FieldSet>
              <FieldLegend variant="label">Recording</FieldLegend>

              <Controller
                control={control}
                name="enabled"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>Enabled</FieldLabel>
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
                            {/* The create entry brings its own plus mark, and a logo beside it
                                reads as though a connection already exists. */}
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
                          ? "Without a connection, recorded activity can't be read, and files from sessions that expire stay in your bucket. The bucket is kept, so attaching a connection later brings the history back."
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

              {/* Bucket and prefix share a line: together they are the object's location, and they
                  are the pair a change to which orphans everything already recorded. */}
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
                    {/* One <p>, because AlertDescription lays its children out as grid rows and a
                        bare <span> would break onto a line of its own mid-sentence. */}
                    <p>
                      Everything already recorded stays in{" "}
                      <span className="font-mono">{data?.config.bucket}</span>, where Infisical can
                      no longer read it. To rotate credentials, update the AWS connection instead of
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
