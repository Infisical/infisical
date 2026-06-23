import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { Field, FieldContent, FieldError, FieldLabel } from "@app/components/v3/generic/Field";
import { Input } from "@app/components/v3/generic/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { TextArea } from "@app/components/v3/generic/TextArea";
import {
  useGetPamAccountById,
  useListPamAccountTemplates,
  useListPamAccountTypes,
  useListPamFoldersAdmin,
  useUpdatePamAccount
} from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { SheetSaveBar } from "../../components/SheetSaveBar";
import {
  accountFormSchema,
  applyServerValidationErrors,
  buildDefaultFieldValues,
  buildEditCredentialValues,
  getMissingRequiredFields,
  TAccountFormValues
} from "./accountFormSchema";
import { ConnectionDetailsForm } from "./ConnectionDetailsForm";
import { CredentialsForm } from "./CredentialsForm";

function filterUnchangedCredentials(
  credentials: Record<string, unknown>
): Record<string, unknown> | null {
  const entries = Object.entries(credentials);
  const changed = entries.filter(([, v]) => v !== UNCHANGED_PASSWORD_SENTINEL);

  if (changed.length === entries.length) {
    return credentials;
  }

  const hasRealChanges = changed.some(([key]) => key !== "authMethod");

  if (!hasRealChanges) return null;

  return Object.fromEntries(changed);
}

const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6"];

type Props = {
  accountId?: string;
  onDirtyChange?: (isDirty: boolean) => void;
};

export const EditAccountForm = ({ accountId, onDirtyChange }: Props) => {
  const { data: account, isLoading: isLoadingAccount } = useGetPamAccountById(accountId);
  const updateAccount = useUpdatePamAccount({ skipValidationToast: true });
  const { data: accountTypes = [] } = useListPamAccountTypes();
  const { data: folders = [] } = useListPamFoldersAdmin();
  const { data: templates = [] } = useListPamAccountTemplates(
    account ? { type: account.accountType } : undefined
  );

  const metadata = useMemo(
    () => accountTypes.find((t) => t.type === account?.accountType),
    [accountTypes, account?.accountType]
  );

  // Keep the current template selectable before the type-filtered list loads
  const templateOptions = useMemo(() => {
    const options = templates.map((t) => ({ id: t.id, name: t.name }));
    if (account && !options.some((o) => o.id === account.templateId)) {
      options.unshift({ id: account.templateId, name: account.templateName });
    }
    return options;
  }, [templates, account]);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { isDirty }
  } = useForm<TAccountFormValues>({
    resolver: zodResolver(accountFormSchema)
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (account && metadata) {
      reset({
        accountType: account.accountType,
        name: account.name,
        description: account.description ?? "",
        folderId: account.folderId,
        templateId: account.templateId,
        connectionDetails: {
          ...buildDefaultFieldValues(metadata.connectionFields),
          ...account.connectionDetails
        },
        credentials: buildEditCredentialValues(metadata.credentialFields, account.credentials)
      });
    }
  }, [account, metadata, reset]);

  const onSubmit = (values: TAccountFormValues) => {
    if (!accountId || !account || !metadata) return;

    clearErrors();
    const missingConnection = getMissingRequiredFields(
      metadata.connectionFields,
      values.connectionDetails
    );
    const missingCredentials = getMissingRequiredFields(
      metadata.credentialFields,
      values.credentials
    );
    if (missingConnection.length || missingCredentials.length) {
      missingConnection.forEach((key) =>
        setError(`connectionDetails.${key}`, {
          type: "required",
          message: "This field is required"
        })
      );
      missingCredentials.forEach((key) =>
        setError(`credentials.${key}`, { type: "required", message: "This field is required" })
      );
      return;
    }

    // Drop unchanged secrets (sentinel) so they're preserved server-side; send the rest
    const filteredCredentials = filterUnchangedCredentials(values.credentials);

    const knownFields = new Set<string>([
      "name",
      "description",
      "folderId",
      "templateId",
      ...metadata.connectionFields.map((f) => `connectionDetails.${f.key}`),
      ...metadata.credentialFields.map((f) => `credentials.${f.key}`)
    ]);

    updateAccount.mutate(
      {
        accountId,
        accountType: values.accountType,
        name: values.name,
        description: values.description || null,
        folderId: values.folderId,
        templateId: values.templateId,
        connectionDetails: values.connectionDetails,
        ...(filteredCredentials ? { credentials: filteredCredentials } : {})
      },
      {
        onSuccess: () => createNotification({ text: "Account updated", type: "success" }),
        onError: (error) => {
          const unmapped = applyServerValidationErrors(error, setError, knownFields);
          if (unmapped.length) {
            createNotification({
              type: "error",
              title: "Validation Error",
              text: unmapped.join(", ")
            });
          }
        }
      }
    );
  };

  if (isLoadingAccount) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {SKELETON_ROWS.map((key) => (
          <Skeleton key={key} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>General settings for this account.</CardDescription>
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
                  <TextArea {...field} rows={2} isError={!!fieldState.error} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="folderId"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>
                  Folder<span className="text-product-pam">*</span>
                </FieldLabel>
                <FieldContent>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" isError={!!fieldState.error}>
                      <SelectValue placeholder="Select folder" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {folders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="templateId"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>
                  Template<span className="text-product-pam">*</span>
                </FieldLabel>
                <FieldContent>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" isError={!!fieldState.error}>
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {templateOptions.map((tpl) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Connection Details</CardTitle>
          <CardDescription>How Infisical reaches this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionDetailsForm control={control} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Credentials</CardTitle>
          <CardDescription>Authentication used to connect to this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <CredentialsForm control={control} />
        </CardContent>
      </Card>

      <div aria-hidden className="h-8 shrink-0" />
      {isDirty && <SheetSaveBar isPending={updateAccount.isPending} onDiscard={() => reset()} />}
    </form>
  );
};
