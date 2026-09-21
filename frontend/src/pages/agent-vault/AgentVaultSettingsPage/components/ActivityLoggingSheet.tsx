import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { AppConnectionOptionContent } from "@app/components/app-connections";
import { createNotification } from "@app/components/notifications";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  Button,
  CodeBlock,
  Combobox,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Toggle
} from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { usePopUp } from "@app/hooks";
import {
  useGetAgentVaultActivityConfig,
  useUpdateAgentVaultActivityConfig
} from "@app/hooks/api/agentVault";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { AgentVaultDocsUrls } from "../../agent-vault-docs-urls";

const NO_CONNECTION = "none";
const CREATE_CONNECTION = "_create";

/** Mirrors the server's normalisation, so "a", "/a" and "a/" are not read as three different prefixes. */
const normalizePrefix = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/` : "";
};

const schema = z.object({
  enabled: z.boolean(),
  appConnectionId: z.string(),
  bucket: z.string().trim().max(255),
  region: z.string(),
  keyPrefix: z
    .string()
    .trim()
    .max(512)
    .regex(/^[A-Za-z0-9!\-_.*'()/]*$/, "Use only letters, numbers and - _ . / characters")
    .refine((value) => !value.split("/").includes(".."), "Cannot contain '..'")
});

type FormData = z.infer<typeof schema>;

const iamPolicyFor = (bucket: string, keyPrefix: string) => {
  const prefix = keyPrefix.replace(/^\/+|\/+$/g, "");
  const objects = `arn:aws:s3:::${bucket || "<bucket>"}/${prefix ? `${prefix}/` : ""}*`;
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
          Resource: objects
        },
        {
          Effect: "Allow",
          Action: ["s3:ListBucket"],
          Resource: `arn:aws:s3:::${bucket || "<bucket>"}`
        }
      ]
    },
    null,
    2
  );
};

const corsPolicyFor = (origin: string) =>
  JSON.stringify(
    [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT"],
        AllowedOrigins: [origin],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3000
      }
    ],
    null,
    2
  );

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const ActivityLoggingSheet = ({ isOpen, onOpenChange }: Props) => {
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
    formState: { isSubmitting }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!isOpen || !data) return;

    reset({
      enabled: data.config.enabled,
      appConnectionId: data.config.appConnectionId ?? NO_CONNECTION,
      bucket: data.config.bucket ?? "",
      region: data.config.region ?? AWS_REGIONS[0].slug,
      keyPrefix: data.config.keyPrefix ?? ""
    });
  }, [isOpen, data, reset]);

  const bucket = watch("bucket") ?? "";
  const keyPrefix = watch("keyPrefix") ?? "";

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  // The create entry is a sentinel option rather than a button beside the field, matching every
  // other product's connection picker.
  const connectionOptions = [
    ...(canCreateConnection ? [{ id: CREATE_CONNECTION, name: "Create New Connection" }] : []),
    ...(connections ?? [])
  ];

  // Only the bucket and the prefix decide where an object lives, so only a change to one of those
  // strands what is already recorded. Warning on a first setup, or on a change of connection or
  // region, is noise that trains people to skip the warning that matters.
  const willRelocate =
    Boolean(data?.config.bucket) &&
    (bucket.trim() !== (data?.config.bucket ?? "") ||
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

      // Server-side validation cannot see a missing CORS rule, so the browser has to try the bucket
      // itself. The probe points at an object that is never written: S3 answers a matching rule with
      // the CORS headers even on a 404, and fetch rejects only when the rule is absent.
      if (result.corsProbeUrl) {
        try {
          await fetch(result.corsProbeUrl, { mode: "cors", credentials: "omit" });
        } catch {
          createNotification(
            {
              title: "Bucket CORS is not configured",
              type: "warning",
              text: "Activity is stored, but nobody can read it until the bucket allows requests from this origin.",
              callToAction: (
                <a href={AgentVaultDocsUrls.activityLogs} target="_blank" rel="noopener noreferrer">
                  CORS setup
                </a>
              )
            },
            { autoClose: 10000 }
          );
        }
      }
    } catch {
      // MutationCache.onError already reports the failure; a second toast would duplicate it.
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full min-h-0 flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              Activity Logging
              <DocumentationLinkBadge href={AgentVaultDocsUrls.activityLogs} />
            </SheetTitle>
            <SheetDescription>
              Records are sealed by the proxy and written straight to a bucket you own. Set the
              destination below.
            </SheetDescription>
          </SheetHeader>

          <div className="thin-scrollbar flex-1 overflow-y-auto p-4">
            <FieldGroup>
              <Controller
                control={control}
                name="enabled"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>Record session activity</FieldLabel>
                      <FieldDescription>
                        Applies to every session in this organization, including ones already
                        running.
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
                            <AppConnectionOptionContent
                              data={option}
                              isOnlyOption={
                                option.id === CREATE_CONNECTION && connectionOptions.length === 1
                              }
                            />
                          )}
                          modal
                        />
                        <FieldDescription>
                          Its credentials write the records, and read them back when you open a
                          session&apos;s activity.
                        </FieldDescription>
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
                </div>

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

                {willRelocate && (
                  <Alert variant="warning">
                    <AlertDescription>
                      {/* One <p>, because AlertDescription lays its children out as grid rows and a
                          bare <span> would break onto a line of its own mid-sentence. */}
                      <p>
                        Everything already recorded stays in{" "}
                        <span className="font-mono">{data?.config.bucket}</span>, where Infisical
                        can no longer read it. To rotate credentials, update the AWS connection
                        instead of moving the bucket.
                      </p>
                    </AlertDescription>
                  </Alert>
                )}
              </FieldSet>

              <Accordion type="single" collapsible variant="ghost">
                <AccordionItem value="bucket-setup">
                  <AccordionTrigger>What the bucket needs</AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-4">
                      <CodeBlock
                        label="Bucket policy for the connection's credentials"
                        value={iamPolicyFor(bucket, keyPrefix)}
                      />
                      <CodeBlock
                        label="Bucket CORS rule, so your browser can read the records back"
                        value={corsPolicyFor(window.location.origin)}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </FieldGroup>
          </div>

          <SheetFooter className="border-t">
            <Button type="submit" variant="av" isPending={isSubmitting} isDisabled={isSubmitting}>
              Save
            </Button>
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>

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
    </Sheet>
  );
};
