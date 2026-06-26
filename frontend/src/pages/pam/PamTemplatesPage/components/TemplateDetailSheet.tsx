import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangleIcon, Ban } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  GatewayPicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { useProject } from "@app/context";
import { AppConnection, useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import {
  accountTypeRequiresRecording,
  PamAccountType,
  useGetPamAccountTemplate,
  usePamAccountTypeMap,
  useUpdatePamAccountTemplate
} from "@app/hooks/api/pam";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";

import { formatDetailDate, PamDetailSheet } from "../../components/PamDetailSheet";
import { PAM_TEMPLATE_TABS } from "../../components/pamResourceTabs";
import { POLICY_EDITORS } from "../../components/policyEditors";
import { SheetSaveBar } from "../../components/SheetSaveBar";
import { AccountPlatformIcon } from "../../PamAccessPage/components/AccountPlatformIcon";

const configSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  description: z.string().max(256).optional()
});

type ConfigForm = z.infer<typeof configSchema>;

const settingsSchema = z
  .object({
    gatewayId: z.string().nullable(),
    gatewayPoolId: z.string().nullable(),
    recordingStorageBackend: z.enum(["postgres", "aws-s3"]),
    recordingConnectionId: z.string().nullable(),
    s3Bucket: z.string().optional(),
    s3Region: z.string().optional(),
    s3KeyPrefix: z.string().optional(),
    policies: z.record(z.unknown())
  })
  .superRefine((data, ctx) => {
    if (data.recordingStorageBackend !== "aws-s3") return;
    if (!data.recordingConnectionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recordingConnectionId"],
        message: "Select an AWS connection"
      });
    }
    if (!data.s3Bucket?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["s3Bucket"],
        message: "Bucket is required"
      });
    }
  });

type SettingsForm = z.infer<typeof settingsSchema>;

type Props = {
  isOpen: boolean;
  templateId?: string;
  onOpenChange: (open: boolean) => void;
};

const ConfigurationTab = ({
  templateId,
  onDirtyChange
}: {
  templateId: string;
  onDirtyChange?: (isDirty: boolean) => void;
}) => {
  const { data: template, isLoading } = useGetPamAccountTemplate(templateId);
  const updateTemplate = useUpdatePamAccountTemplate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<ConfigForm>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      name: "",
      description: ""
    }
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (template) {
      reset({
        name: template.name,
        description: template.description ?? ""
      });
    }
  }, [template, reset]);

  const onSubmit = (data: ConfigForm) => {
    updateTemplate.mutate(
      {
        templateId,
        name: data.name,
        description: data.description || null
      },
      {
        onSuccess: () => createNotification({ type: "success", text: "Template updated" })
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Configuration</CardTitle>
          <CardDescription>Edit the template name and description.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>
                  Name<span className="text-product-pam">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input {...field} isError={!!fieldState.error} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Description</FieldLabel>
                <FieldContent>
                  <TextArea {...field} rows={3} isError={!!fieldState.error} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <div aria-hidden className="h-8 shrink-0" />
      {isDirty && <SheetSaveBar isPending={updateTemplate.isPending} onDiscard={() => reset()} />}
    </form>
  );
};

const SettingsTab = ({
  templateId,
  onDirtyChange
}: {
  templateId: string;
  onDirtyChange?: (isDirty: boolean) => void;
}) => {
  const { data: template, isLoading } = useGetPamAccountTemplate(templateId);
  const updateTemplate = useUpdatePamAccountTemplate();
  const { currentProject } = useProject();
  const { data: awsConnections = [] } = useListAvailableAppConnections(
    AppConnection.AWS,
    currentProject.id
  );
  const { map: accountTypeMap } = usePamAccountTypeMap();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isDirty }
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      gatewayId: null,
      gatewayPoolId: null,
      recordingStorageBackend: "postgres",
      recordingConnectionId: null,
      s3Bucket: "",
      s3Region: "",
      s3KeyPrefix: "",
      policies: {}
    }
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (template) {
      const settings = (template.settings ?? {}) as Record<string, unknown>;
      const s3Config = (settings.recordingS3Config ?? {}) as Record<string, string>;
      const savedBackend = settings.recordingStorageBackend as "postgres" | "aws-s3" | undefined;
      reset({
        gatewayId: template.gatewayId ?? null,
        gatewayPoolId: template.gatewayPoolId ?? null,
        recordingStorageBackend: savedBackend ?? "postgres",
        recordingConnectionId: template.recordingConnectionId ?? null,
        s3Bucket: s3Config.bucket ?? "",
        s3Region: s3Config.region ?? "",
        s3KeyPrefix: s3Config.keyPrefix ?? "",
        policies: (template.policies as Record<string, unknown>) ?? {}
      });
    }
  }, [template, reset]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!template) return null;

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const policies = watch("policies");
  const storageBackend = watch("recordingStorageBackend");
  const requiresRecording = accountTypeRequiresRecording(template.type);
  const typeName = accountTypeMap[template.type]?.name ?? template.type;
  const applicablePolicies = (accountTypeMap[template.type]?.applicablePolicies ?? []).filter(
    (p) => POLICY_EDITORS[p.key]
  );

  const onSubmit = (data: SettingsForm) => {
    const settings: Record<string, unknown> = {
      ...((template.settings ?? {}) as Record<string, unknown>),
      recordingStorageBackend: data.recordingStorageBackend
    };

    if (data.recordingStorageBackend === "aws-s3" && data.s3Bucket) {
      settings.recordingS3Config = {
        bucket: data.s3Bucket,
        region: data.s3Region || "us-east-1",
        ...(data.s3KeyPrefix ? { keyPrefix: data.s3KeyPrefix } : {})
      };
    } else {
      delete settings.recordingS3Config;
    }

    updateTemplate.mutate(
      {
        templateId,
        policies: data.policies,
        gatewayId: data.gatewayId,
        gatewayPoolId: data.gatewayPoolId,
        settings,
        recordingConnectionId:
          data.recordingStorageBackend === "aws-s3" ? data.recordingConnectionId : null
      },
      {
        onSuccess: async (result) => {
          createNotification({ type: "success", text: "Template updated" });
          const { corsProbeUrl } = result as { corsProbeUrl?: string | null };
          if (corsProbeUrl) {
            try {
              await fetch(corsProbeUrl, { mode: "cors" });
            } catch {
              createNotification(
                {
                  title: "Bucket CORS not configured",
                  type: "warning",
                  text: "Session playback requires the bucket to allow GET requests from this origin.",
                  callToAction: (
                    <a
                      href="https://infisical.com/docs/documentation/platform/pam/recording-storage"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline"
                    >
                      CORS setup docs
                    </a>
                  )
                },
                { autoClose: 10000 }
              );
            }
          }
        }
      }
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 p-4">
      {applicablePolicies.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Policies</CardTitle>
            <CardDescription>
              Policies available for {typeName} accounts using this template.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {applicablePolicies.map((p) => {
              const Editor = POLICY_EDITORS[p.key]!;
              return (
                <Editor
                  key={p.key}
                  label={p.label}
                  description={p.description}
                  value={policies[p.key]}
                  onChange={(value) => {
                    const next = { ...policies };
                    if (value === null || value === undefined) delete next[p.key];
                    else next[p.key] = value;
                    setValue("policies", next, { shouldDirty: true });
                  }}
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">System Settings</CardTitle>
          <CardDescription>System-level defaults for accounts using this template.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Field>
            <FieldLabel>Gateway</FieldLabel>
            <FieldContent>
              <GatewayPicker
                value={{ gatewayId, gatewayPoolId }}
                onChange={(value) => {
                  setValue("gatewayId", value.gatewayId, { shouldDirty: true });
                  setValue("gatewayPoolId", value.gatewayPoolId, { shouldDirty: true });
                }}
                noGatewayLabel="No Gateway"
                noGatewayIcon={Ban}
              />
              <FieldDescription>
                Used to reach accounts unless overridden on the account.
              </FieldDescription>
            </FieldContent>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Session Recording</CardTitle>
          <CardDescription>
            Where session recordings for accounts using this template are stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Controller
            name="recordingStorageBackend"
            control={control}
            render={({ field }) => (
              <Field>
                <FieldLabel>Storage backend</FieldLabel>
                <FieldContent>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="postgres">Internal Database</SelectItem>
                      <SelectItem value="aws-s3">AWS S3</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          />

          {requiresRecording && storageBackend === "postgres" && (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertTitle>Accounts cannot be launched</AlertTitle>
              <AlertDescription>
                {typeName} accounts require an external recording storage backend. Accounts using
                this template can still be created, but sessions can&apos;t be launched until
                external storage is configured.
              </AlertDescription>
            </Alert>
          )}

          {storageBackend === "aws-s3" && (
            <>
              <Alert variant="warning">
                <AlertTriangleIcon />
                <AlertTitle>Changing bucket affects existing recordings</AlertTitle>
                <AlertDescription>
                  Changing the bucket on a template with existing recordings makes those recordings
                  inaccessible unless you manually migrate each object. Keep the same bucket and key
                  prefix when rotating credentials.
                </AlertDescription>
              </Alert>

              <Controller
                name="recordingConnectionId"
                control={control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>AWS Connection</FieldLabel>
                    <FieldContent>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v || null)}
                      >
                        <SelectTrigger className="w-full" isError={!!fieldState.error}>
                          <SelectValue placeholder="Select an AWS connection" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {awsConnections.map((conn) => (
                            <SelectItem key={conn.id} value={conn.id}>
                              {conn.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.error ? (
                        <FieldError>{fieldState.error.message}</FieldError>
                      ) : (
                        <FieldDescription>
                          The AWS connection used to authenticate with S3.
                        </FieldDescription>
                      )}
                    </FieldContent>
                  </Field>
                )}
              />

              <Controller
                name="s3Bucket"
                control={control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>S3 Bucket</FieldLabel>
                    <FieldContent>
                      <Input
                        {...field}
                        placeholder="my-recordings-bucket"
                        isError={!!fieldState.error}
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldContent>
                  </Field>
                )}
              />

              <Controller
                name="s3Region"
                control={control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Region</FieldLabel>
                    <FieldContent>
                      <Input {...field} placeholder="us-east-1" />
                    </FieldContent>
                  </Field>
                )}
              />

              <Controller
                name="s3KeyPrefix"
                control={control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Key prefix (optional)</FieldLabel>
                    <FieldContent>
                      <Input {...field} placeholder="pam-recordings/" />
                      <FieldDescription>Optional prefix for S3 object keys.</FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              />
            </>
          )}
        </CardContent>
      </Card>

      <div aria-hidden className="h-8 shrink-0" />
      {isDirty && <SheetSaveBar isPending={updateTemplate.isPending} onDiscard={() => reset()} />}
    </form>
  );
};

export const TemplateDetailSheet = ({ isOpen, templateId, onOpenChange }: Props) => {
  const { data: template, isLoading } = useGetPamAccountTemplate(isOpen ? templateId : undefined);
  const { tab, setTab } = usePamSheetState("templateId");
  const [isFormDirty, setIsFormDirty] = useState(false);

  const { map: accountTypeMap } = usePamAccountTypeMap();
  const accountType = template?.type as PamAccountType | undefined;
  const typeInfo = accountType ? accountTypeMap[accountType] : undefined;

  const metadata = template
    ? [
        ...(template.description ? [{ label: "Description", value: template.description }] : []),
        {
          label: "Accounts",
          value: `${template.accountCount ?? 0} using this template`
        },
        { label: "Created", value: formatDetailDate(template.createdAt) }
      ]
    : [];

  const tabContent: Partial<Record<PamSheetTab, JSX.Element | null>> = {
    [PamSheetTab.General]: templateId ? (
      <SettingsTab templateId={templateId} onDirtyChange={setIsFormDirty} />
    ) : null,
    [PamSheetTab.Configuration]: templateId ? (
      <ConfigurationTab templateId={templateId} onDirtyChange={setIsFormDirty} />
    ) : null
  };

  return (
    <PamDetailSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isLoading={isLoading}
      accountType={accountType}
      title={template?.name}
      typeBadge={typeInfo?.name}
      activeTab={tab}
      onTabChange={setTab}
      icon={
        accountType ? (
          <div className="mb-4 flex size-16 items-center justify-center rounded-lg border border-border bg-container">
            <AccountPlatformIcon accountType={accountType} size={40} />
          </div>
        ) : undefined
      }
      metadata={metadata}
      tabs={PAM_TEMPLATE_TABS.map((tabDef) => ({
        value: tabDef.value,
        label: tabDef.label,
        icon: <tabDef.icon className="mr-1.5 size-4" />,
        content: tabContent[tabDef.value] ?? null
      }))}
      isDirty={isFormDirty}
    />
  );
};
