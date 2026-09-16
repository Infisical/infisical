import { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CodeBlock,
  DocumentationLinkBadge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Toggle
} from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import {
  useGetAgentVaultActivityConfig,
  useListAgentVaultAwsConnections,
  useUpdateAgentVaultActivityConfig
} from "@app/hooks/api/agentVault";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AgentVaultDocsUrls } from "../agent-vault-docs-urls";

const NO_CONNECTION = "none";

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

export const AgentVaultSettingsPage = () => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const { data, isPending } = useGetAgentVaultActivityConfig(isAdmin);
  const updateConfig = useUpdateAgentVaultActivityConfig();
  const { data: connections, isPending: isLoadingConnections } = useListAgentVaultAwsConnections(isAdmin);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isDirty, isSubmitting }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!data) return;
    reset({
      enabled: data.config.enabled,
      appConnectionId: data.config.appConnectionId ?? NO_CONNECTION,
      bucket: data.config.bucket ?? "",
      region: data.config.region ?? AWS_REGIONS[0].slug,
      keyPrefix: data.config.keyPrefix ?? ""
    });
  }, [data, reset]);

  const bucket = watch("bucket") ?? "";
  const keyPrefix = watch("keyPrefix") ?? "";

  const usage = data?.usage;
  const usageRatio = usage && usage.ceiling > 0 ? usage.storedRecordCount / usage.ceiling : 0;
  const formatCount = useMemo(() => new Intl.NumberFormat(), []);

  const hasConnections = (connections?.length ?? 0) > 0;

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

  if (!isAdmin) {
    return (
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Settings are administrator only</EmptyTitle>
            <EmptyDescription>
              Ask an Agent Vault administrator to change where session activity is stored.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8"
    >
      <Helmet>
        <title>{t("common.head-title", { title: "Settings" })}</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={SettingsIcon}
        title="Settings"
        description="How Agent Vault stores what your agents did."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Activity Logging
            <DocumentationLinkBadge href={AgentVaultDocsUrls.activityLogs} />
          </CardTitle>
          <CardDescription>
            Record every request an agent makes through a proxy: the method, host, path and result.
            Records are encrypted and stored in a bucket you own. Infisical keeps only an index.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
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

              {!isLoadingConnections && !hasConnections ? (
                <Alert variant="warning">
                  <AlertDescription>
                    Activity is stored in your own S3 bucket, which needs an AWS connection. This
                    organization has none yet.{" "}
                    <Link
                      to="/organizations/$orgId/app-connections"
                      params={{ orgId: currentOrg.id }}
                      className="underline"
                    >
                      Add an AWS connection
                    </Link>{" "}
                    to continue.
                  </AlertDescription>
                </Alert>
              ) : (
                <Controller
                  control={control}
                  name="appConnectionId"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel>AWS Connection</FieldLabel>
                      <FieldContent>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a connection" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            <SelectItem value={NO_CONNECTION}>None</SelectItem>
                            {(connections ?? []).map((connection) => (
                              <SelectItem key={connection.id} value={connection.id}>
                                {connection.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Its credentials write the records and read them back for playback.
                        </FieldDescription>
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
              )}

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
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>Region</FieldLabel>
                      <FieldContent>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a region" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {AWS_REGIONS.map((region) => (
                              <SelectItem key={region.slug} value={region.slug}>
                                {region.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                    <FieldLabel>Key Prefix</FieldLabel>
                    <FieldContent>
                      <Input
                        {...field}
                        placeholder="agent-vault"
                        isError={Boolean(fieldState.error)}
                      />
                      <FieldDescription>
                        Optional. Every object is written under this prefix.
                      </FieldDescription>
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldContent>
                  </Field>
                )}
              />

              <Alert variant="warning">
                <AlertDescription>
                  Changing the bucket or the prefix leaves everything already recorded where it is,
                  and Infisical can no longer read it. To rotate credentials, update the AWS
                  connection instead.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-4">
                <CodeBlock
                  label="Bucket policy for the connection's credentials"
                  value={iamPolicyFor(bucket, keyPrefix)}
                />
                <CodeBlock
                  label="Bucket CORS rule, so the browser can read recordings"
                  value={corsPolicyFor(window.location.origin)}
                />
              </div>

              {usage && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted">
                    {formatCount.format(usage.storedRecordCount)} of{" "}
                    {formatCount.format(usage.ceiling)} records stored
                  </p>
                  {usageRatio >= 0.8 && (
                    <Alert variant={usageRatio >= 1 ? "danger" : "warning"}>
                      <AlertDescription>
                        {usageRatio >= 1
                          ? "This organization is at its activity storage limit. Nothing new is being recorded until older sessions are deleted or the limit is raised."
                          : "This organization is close to its activity storage limit. Recording stops when it is reached."}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>

        {!isPending && (
          <CardContent className="-mt-2 flex justify-end gap-2 pt-0">
            <Button variant="ghost" type="button" isDisabled={!isDirty} onClick={() => reset()}>
              Discard
            </Button>
            <Button variant="av" type="submit" isDisabled={!isDirty} isPending={isSubmitting}>
              Save
            </Button>
          </CardContent>
        )}
      </Card>
    </form>
  );
};
