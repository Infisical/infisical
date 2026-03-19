import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormControl, Input, Select, SelectItem, TextArea } from "@app/components/v2";
import { Button, SheetFooter } from "@app/components/v3";
import { PamResourceType, TSSHAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { SSHAuthMethod } from "@app/hooks/api/pam/types/ssh-resource";

import { SshCaSetupSection } from "../../../components/SshCaSetupSection";
import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";
import { MetadataFields } from "./MetadataFields";
import { RequireMfaField } from "./RequireMfaField";

type Props = {
  account?: TSSHAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const SSHPasswordCredentialsSchema = z.object({
  authMethod: z.literal(SSHAuthMethod.Password),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().trim().min(1, "Password is required")
});

const SSHPublicKeyCredentialsSchema = z.object({
  authMethod: z.literal(SSHAuthMethod.PublicKey),
  username: z.string().trim().min(1, "Username is required"),
  privateKey: z.string().trim().min(1, "Private key is required")
});

const SSHCertificateCredentialsSchema = z.object({
  authMethod: z.literal(SSHAuthMethod.Certificate),
  username: z.string().trim().min(1, "Username is required")
});

const BaseSshAccountSchema = z.discriminatedUnion("authMethod", [
  SSHPasswordCredentialsSchema,
  SSHPublicKeyCredentialsSchema,
  SSHCertificateCredentialsSchema
]);

const formSchema = genericAccountFieldsSchema.extend({
  credentials: BaseSshAccountSchema,
  requireMfa: z.boolean().nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

const SshAccountFields = ({ isUpdate, resourceId }: { isUpdate: boolean; resourceId: string }) => {
  const { control, setValue } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);

  const authMethod =
    useWatch({ control, name: "credentials.authMethod" }) || SSHAuthMethod.Password;
  const password = useWatch({ control, name: "credentials.password" });

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

  return (
    <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
      <Controller
        name="credentials.authMethod"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            className="mb-3"
            isError={Boolean(error?.message)}
            errorText={error?.message}
            label="Authentication Method"
          >
            <Select
              value={value || SSHAuthMethod.Password}
              onValueChange={(newAuthMethod) => {
                onChange(newAuthMethod);
                // Clear out credentials from other auth methods
                setValue("credentials.password", undefined, { shouldDirty: true });
                setValue("credentials.privateKey", undefined, { shouldDirty: true });
              }}
              className="w-full border border-mineshaft-500"
            >
              <SelectItem value={SSHAuthMethod.Password}>Password</SelectItem>
              <SelectItem value={SSHAuthMethod.PublicKey}>SSH Key</SelectItem>
              <SelectItem value={SSHAuthMethod.Certificate}>Certificate</SelectItem>
            </Select>
          </FormControl>
        )}
      />

      <Controller
        name="credentials.username"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            className="mb-3"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Username"
          >
            <Input {...field} autoComplete="off" />
          </FormControl>
        )}
      />

      {authMethod === SSHAuthMethod.Password && (
        <Controller
          name="credentials.password"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="mb-0"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Password"
            >
              <Input
                {...field}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                onFocus={() => {
                  if (isUpdate && field.value === UNCHANGED_PASSWORD_SENTINEL) {
                    field.onChange("");
                  }
                  setShowPassword(true);
                }}
                onBlur={() => {
                  if (isUpdate && field.value === "") {
                    field.onChange(UNCHANGED_PASSWORD_SENTINEL);
                  }
                  setShowPassword(false);
                }}
              />
            </FormControl>
          )}
        />
      )}

      {authMethod === SSHAuthMethod.PublicKey && (
        <Controller
          name="credentials.privateKey"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="mb-0"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Private Key"
            >
              <TextArea
                {...field}
                value={field.value === UNCHANGED_PASSWORD_SENTINEL ? "" : field.value}
                className="min-h-32 resize-y font-mono text-xs"
                placeholder={
                  isUpdate && field.value === UNCHANGED_PASSWORD_SENTINEL
                    ? "Private key unchanged - click to update"
                    : "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
                }
                onFocus={() => {
                  if (isUpdate && field.value === UNCHANGED_PASSWORD_SENTINEL) {
                    field.onChange("");
                  }
                }}
                onBlur={() => {
                  if (isUpdate && field.value === "") {
                    field.onChange(UNCHANGED_PASSWORD_SENTINEL);
                  }
                }}
              />
            </FormControl>
          )}
        />
      )}

      {authMethod === SSHAuthMethod.Certificate && <SshCaSetupSection resourceId={resourceId} />}
    </div>
  );
};

export const SshAccountForm = ({ account, resourceId, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(account);
  const effectiveResourceId = resourceId || account?.resource.id || "";

  const getDefaultCredentials = () => {
    if (!account) return undefined;

    if (account.credentials.authMethod === SSHAuthMethod.Password) {
      return {
        ...account.credentials,
        password: UNCHANGED_PASSWORD_SENTINEL
      };
    }

    if (account.credentials.authMethod === SSHAuthMethod.PublicKey) {
      return {
        ...account.credentials,
        privateKey: UNCHANGED_PASSWORD_SENTINEL
      };
    }

    return account.credentials;
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: getDefaultCredentials()
        }
      : {
          name: "",
          description: "",
          requireMfa: false,
          credentials: {
            authMethod: SSHAuthMethod.Password,
            username: "",
            password: ""
          }
        }
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form
        className="flex flex-1 flex-col overflow-hidden"
        onSubmit={(e) => {
          handleSubmit(onSubmit)(e);
        }}
      >
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericAccountFields />
          <SshAccountFields isUpdate={isUpdate} resourceId={effectiveResourceId} />
          <RequireMfaField />
          <MetadataFields />
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="neutral"
            type="submit"
          >
            {isUpdate ? "Update Account" : "Create Account"}
          </Button>
          <Button onClick={() => closeSheet()} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
