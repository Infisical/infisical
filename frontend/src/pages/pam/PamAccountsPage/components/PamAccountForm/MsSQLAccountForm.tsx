import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { Button, SheetFooter } from "@app/components/v3";
import { PamResourceType, TMsSQLAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { MsSqlAuthMethod } from "@app/hooks/api/pam/types/mssql-resource";

import {
  AccountPolicyField,
  GenericAccountFields,
  genericAccountFieldsSchema
} from "./GenericAccountFields";
import { MetadataFields } from "./MetadataFields";
import { RequireMfaField } from "./RequireMfaField";

type Props = {
  account?: TMsSQLAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const MsSQLSqlLoginCredentialsSchema = z.object({
  authMethod: z.literal(MsSqlAuthMethod.SqlLogin),
  username: z.string().trim().min(1, "Username is required").max(63),
  password: z.string().trim().min(1, "Password is required").max(256)
});

const MsSQLNtlmCredentialsSchema = z.object({
  authMethod: z.literal(MsSqlAuthMethod.Ntlm),
  username: z.string().trim().min(1, "Username is required").max(63),
  password: z.string().trim().min(1, "Password is required").max(256),
  domain: z.string().trim().min(1, "Domain is required for NTLM authentication").max(255)
});

const MsSQLKerberosCredentialsSchema = z.object({
  authMethod: z.literal(MsSqlAuthMethod.Kerberos),
  username: z.string().trim().min(1, "Username is required").max(63),
  password: z.string().trim().min(1, "Password is required").max(256),
  realm: z.string().trim().min(1, "Realm is required for Kerberos authentication").max(255),
  kdcAddress: z.string().trim().max(255).optional(),
  spn: z.string().trim().min(1, "SPN is required for Kerberos authentication").max(500)
});

const MsSQLAccountCredentialsSchema = z.discriminatedUnion("authMethod", [
  MsSQLSqlLoginCredentialsSchema,
  MsSQLNtlmCredentialsSchema,
  MsSQLKerberosCredentialsSchema
]);

const formSchema = genericAccountFieldsSchema.extend({
  credentials: MsSQLAccountCredentialsSchema,
  requireMfa: z.boolean().nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

const MsSQLAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control, setValue } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);
  const password = useWatch({ control, name: "credentials.password" });

  const authMethod =
    useWatch({ control, name: "credentials.authMethod" }) || MsSqlAuthMethod.SqlLogin;

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
      <Controller
        name="credentials.authMethod"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error?.message)}
            errorText={error?.message}
            label="Authentication Method"
          >
            <Select
              value={value || MsSqlAuthMethod.SqlLogin}
              onValueChange={(newAuthMethod) => {
                onChange(newAuthMethod);
                setValue("credentials.domain", undefined, { shouldDirty: true });
                setValue("credentials.realm", undefined, { shouldDirty: true });
                setValue("credentials.kdcAddress", undefined, { shouldDirty: true });
                setValue("credentials.spn", undefined, { shouldDirty: true });
              }}
              className="w-full border border-mineshaft-500"
            >
              <SelectItem value={MsSqlAuthMethod.SqlLogin}>SQL Server Authentication</SelectItem>
              <SelectItem value={MsSqlAuthMethod.Ntlm}>Windows Authentication (NTLM)</SelectItem>
              <SelectItem value={MsSqlAuthMethod.Kerberos}>
                Windows Authentication (Kerberos)
              </SelectItem>
            </Select>
          </FormControl>
        )}
      />

      {authMethod === MsSqlAuthMethod.Ntlm && (
        <Controller
          name="credentials.domain"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Domain"
            >
              <Input {...field} autoComplete="off" placeholder="CORP.EXAMPLE.COM" />
            </FormControl>
          )}
        />
      )}

      {authMethod === MsSqlAuthMethod.Kerberos && (
        <>
          <Controller
            name="credentials.realm"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Realm"
              >
                <Input {...field} autoComplete="off" placeholder="CORP.EXAMPLE.COM" />
              </FormControl>
            )}
          />
          <Controller
            name="credentials.spn"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Service Principal Name (SPN)"
              >
                <Input
                  {...field}
                  autoComplete="off"
                  placeholder="MSSQLSvc/sqlserver.corp.com:1433"
                />
              </FormControl>
            )}
          />
          <Controller
            name="credentials.kdcAddress"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="KDC Address (Optional)"
              >
                <Input {...field} autoComplete="off" placeholder="dc.corp.example.com" />
              </FormControl>
            )}
          />
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Controller
          name="credentials.username"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Username"
            >
              <Input {...field} autoComplete="off" placeholder="user" />
            </FormControl>
          )}
        />

        <Controller
          name="credentials.password"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Password"
            >
              <Input
                {...field}
                placeholder="••••••"
                autoComplete="new-password"
                type={showPassword ? "text" : "password"}
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
      </div>
    </div>
  );
};

export const MsSQLAccountForm = ({ account, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(account);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: {
            ...account.credentials,
            authMethod: account.credentials.authMethod || MsSqlAuthMethod.SqlLogin,
            password: UNCHANGED_PASSWORD_SENTINEL
          }
        }
      : {
          name: "",
          description: "",
          requireMfa: false,
          credentials: {
            authMethod: MsSqlAuthMethod.SqlLogin,
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
      <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericAccountFields />
          <MsSQLAccountFields isUpdate={isUpdate} />
          <RequireMfaField />
          <AccountPolicyField />
          <MetadataFields />
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="neutral"
            type="submit"
          >
            {isUpdate ? "Update Account" : "Add Account"}
          </Button>
          <Button onClick={() => closeSheet()} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
