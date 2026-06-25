import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ban } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
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
  TextArea
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
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
import { PatternRuleEditor } from "../../components/policyEditors/PatternRuleEditor";
import { SheetSaveBar } from "../../components/SheetSaveBar";
import { AccountPlatformIcon } from "../../PamAccessPage/components/AccountPlatformIcon";
import { RecordingConnectionPicker } from "../../PamAccountsPage/components/RecordingConnectionPicker";

const configSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  description: z.string().max(256).optional()
});

type ConfigForm = z.infer<typeof configSchema>;

const settingsSchema = z.object({
  gatewayId: z.string().nullable(),
  gatewayPoolId: z.string().nullable(),
  recordingConnectionId: z.string().nullable(),
  policies: z.record(z.unknown()),
  sessionLogMaskingPatterns: z.string().optional()
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
    defaultValues: { name: "", description: "" }
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (template) {
      reset({ name: template.name, description: template.description ?? "" });
    }
  }, [template, reset]);

  const onSubmit = (data: ConfigForm) => {
    updateTemplate.mutate(
      { templateId, name: data.name, description: data.description || null },
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

  const {
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
      recordingConnectionId: null,
      policies: {},
      sessionLogMaskingPatterns: ""
    }
  });

  const { map: accountTypeMap } = usePamAccountTypeMap();

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (template) {
      reset({
        gatewayId: template.gatewayId ?? null,
        gatewayPoolId: template.gatewayPoolId ?? null,
        recordingConnectionId: template.recordingConnectionId ?? null,
        policies: (template.policies as Record<string, unknown>) ?? {},
        sessionLogMaskingPatterns:
          ((template.settings as Record<string, unknown> | null)
            ?.sessionLogMaskingPatterns as string) ?? ""
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
  const recordingConnectionId = watch("recordingConnectionId");
  const policies = watch("policies");
  const showRecording = accountTypeRequiresRecording(template.type);
  const applicablePolicies = (accountTypeMap[template.type]?.applicablePolicies ?? []).filter(
    (p) => POLICY_EDITORS[p.key]
  );

  const onSubmit = (data: SettingsForm) => {
    updateTemplate.mutate(
      {
        templateId,
        policies: data.policies,
        gatewayId: data.gatewayId,
        gatewayPoolId: data.gatewayPoolId,
        ...(showRecording ? { recordingConnectionId: data.recordingConnectionId } : {}),
        settings: {
          ...((template?.settings as Record<string, unknown>) ?? {}),
          sessionLogMaskingPatterns: data.sessionLogMaskingPatterns?.trim() || undefined
        }
      },
      {
        onSuccess: () => createNotification({ type: "success", text: "Template updated" })
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
              Policies available for {accountTypeMap[template.type]?.name ?? template.type} accounts
              using this template.
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
        <CardContent className="flex flex-col gap-4">
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

          {showRecording && (
            <Field>
              <FieldLabel>Recording Bucket</FieldLabel>
              <FieldContent>
                <RecordingConnectionPicker
                  value={recordingConnectionId}
                  includeNone
                  onChange={(value) =>
                    setValue("recordingConnectionId", value, { shouldDirty: true })
                  }
                />
                <FieldDescription>Where session recordings are stored.</FieldDescription>
              </FieldContent>
            </Field>
          )}

          <PatternRuleEditor
            label="Session Log Masking"
            description="Matching content in session recordings will be masked (one regex per line)."
            value={watch("sessionLogMaskingPatterns") ?? ""}
            onChange={(val) =>
              setValue("sessionLogMaskingPatterns", (val as string) ?? "", { shouldDirty: true })
            }
          />
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
    [PamSheetTab.Advanced]: templateId ? (
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
