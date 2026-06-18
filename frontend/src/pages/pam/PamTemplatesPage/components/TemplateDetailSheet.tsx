import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input,
  Switch,
  TextArea
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  PamAccountType,
  useDeletePamAccountTemplate,
  useGetPamAccountTemplate,
  usePamAccountTypeMap,
  useUpdatePamAccountTemplate
} from "@app/hooks/api/pam";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";

import { formatDetailDate, PamDetailSheet } from "../../components/PamDetailSheet";
import { SheetSaveBar } from "../../components/SheetSaveBar";
import { AccountPlatformIcon } from "../../PamAccessPage/components/AccountPlatformIcon";
import { DeleteTemplateModal } from "./DeleteTemplateModal";

const configSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  description: z.string().max(256).optional()
});

type ConfigForm = z.infer<typeof configSchema>;

const accessPolicySchema = z.object({
  requireReason: z.boolean(),
  requireMfa: z.boolean(),
  maxSessionDurationSeconds: z
    .number({ invalid_type_error: "Must be a number" })
    .int()
    .min(60, "Minimum 60 seconds")
    .max(86400, "Maximum 24 hours")
    .optional()
    .nullable()
});

type AccessPolicyForm = z.infer<typeof accessPolicySchema>;

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
            render={({ field }) => (
              <Field>
                <FieldLabel>Description</FieldLabel>
                <FieldContent>
                  <TextArea {...field} rows={3} />
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

const AccessPolicyTab = ({
  templateId,
  onDirtyChange
}: {
  templateId: string;
  onDirtyChange?: (isDirty: boolean) => void;
}) => {
  const { data: template, isLoading } = useGetPamAccountTemplate(templateId);
  const updateTemplate = useUpdatePamAccountTemplate();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty }
  } = useForm<AccessPolicyForm>({
    resolver: zodResolver(accessPolicySchema),
    defaultValues: {
      requireReason: false,
      requireMfa: false,
      maxSessionDurationSeconds: null
    }
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (template) {
      const policy = (template.accessPolicy ?? {}) as Record<string, unknown>;
      reset({
        requireReason: Boolean(policy.requireReason),
        requireMfa: Boolean(policy.requireMfa),
        maxSessionDurationSeconds:
          typeof policy.maxSessionDurationSeconds === "number"
            ? policy.maxSessionDurationSeconds
            : null
      });
    }
  }, [template, reset]);

  const onSubmit = (data: AccessPolicyForm) => {
    updateTemplate.mutate(
      {
        templateId,
        accessPolicy: {
          requireReason: data.requireReason,
          requireMfa: data.requireMfa,
          maxSessionDurationSeconds: data.maxSessionDurationSeconds ?? undefined
        }
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
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Access Policy</CardTitle>
          <CardDescription>
            Governance rules applied to all accounts using this template.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Field>
            <FieldLabel>Max session duration (seconds)</FieldLabel>
            <FieldContent>
              <Input
                type="number"
                placeholder="e.g. 3600"
                isError={!!errors.maxSessionDurationSeconds}
                {...register("maxSessionDurationSeconds", {
                  setValueAs: (v: string) => {
                    if (v === "" || v === null || v === undefined) return null;
                    const n = Number(v);
                    return Number.isNaN(n) ? null : n;
                  }
                })}
              />
              <FieldDescription>Between 60 and 86400. Leave empty for no limit.</FieldDescription>
              <FieldError>{errors.maxSessionDurationSeconds?.message}</FieldError>
            </FieldContent>
          </Field>

          <Field orientation="horizontal" className="items-center!">
            <FieldContent>
              <FieldTitle>Require reason</FieldTitle>
              <FieldDescription>Users must provide a reason before accessing.</FieldDescription>
            </FieldContent>
            <Controller
              name="requireReason"
              control={control}
              render={({ field }) => (
                <Switch checked={field.value} variant="pam" onCheckedChange={field.onChange} />
              )}
            />
          </Field>

          <Field orientation="horizontal" className="items-center!">
            <FieldContent>
              <FieldTitle>Require MFA</FieldTitle>
              <FieldDescription>
                Users must re-authenticate with MFA before accessing.
              </FieldDescription>
            </FieldContent>
            <Controller
              name="requireMfa"
              control={control}
              render={({ field }) => (
                <Switch checked={field.value} variant="pam" onCheckedChange={field.onChange} />
              )}
            />
          </Field>
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
  const deleteTemplate = useDeletePamAccountTemplate();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);

  const { map: accountTypeMap } = usePamAccountTypeMap();
  const accountType = template?.type as PamAccountType | undefined;
  const typeInfo = accountType ? accountTypeMap[accountType] : undefined;

  const handleDelete = (id: string) => {
    deleteTemplate.mutate(
      { templateId: id },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: "Template deleted" });
          setIsDeleteOpen(false);
          onOpenChange(false);
        }
      }
    );
  };

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

  const actions = template ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="ghost" size="sm" aria-label="Template actions" className="text-muted">
          <MoreHorizontal className="size-4" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => setTab(PamSheetTab.Configuration)}>
          <Settings />
          Configure
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onClick={() => setIsDeleteOpen(true)}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : undefined;

  return (
    <>
      <PamDetailSheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isLoading={isLoading}
        accountType={accountType}
        title={template?.name}
        typeBadge={typeInfo?.name}
        activeTab={tab}
        onTabChange={setTab}
        actions={actions}
        icon={
          accountType ? (
            <div className="mb-4 flex size-16 items-center justify-center rounded-lg border border-border bg-container">
              <AccountPlatformIcon accountType={accountType} size={40} />
            </div>
          ) : undefined
        }
        metadata={metadata}
        tabs={[
          {
            value: PamSheetTab.AccessPolicy,
            label: "Access Policy",
            icon: <ShieldCheck className="mr-1.5 size-4" />,
            content: templateId ? (
              <AccessPolicyTab templateId={templateId} onDirtyChange={setIsFormDirty} />
            ) : null
          },
          {
            value: PamSheetTab.Configuration,
            label: "Configuration",
            icon: <Settings className="mr-1.5 size-4" />,
            content: templateId ? (
              <ConfigurationTab templateId={templateId} onDirtyChange={setIsFormDirty} />
            ) : null
          }
        ]}
        isDirty={isFormDirty}
      />

      <DeleteTemplateModal
        template={template}
        isOpen={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={handleDelete}
        isDeleting={deleteTemplate.isPending}
      />
    </>
  );
};
