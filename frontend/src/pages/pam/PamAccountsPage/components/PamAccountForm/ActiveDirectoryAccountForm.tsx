import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { Button, SheetFooter } from "@app/components/v3";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import {
  ActiveDirectoryAccountType,
  TActiveDirectoryAccount
} from "@app/hooks/api/pamDomain/active-directory-types";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";
import { MetadataFields } from "./MetadataFields";
import { RequireMfaField } from "./RequireMfaField";

type Props = {
  account?: TActiveDirectoryAccount;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const formSchema = genericAccountFieldsSchema.extend({
  credentials: z.object({
    username: z.string().trim().min(1, "Username is required"),
    password: z.string().trim().min(1, "Password is required")
  }),
  internalMetadata: z.object({
    accountType: z.nativeEnum(ActiveDirectoryAccountType)
  }),
  requireMfa: z.boolean().nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

export const ActiveDirectoryAccountForm = ({ account, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(account);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: {
            ...account.credentials,
            password: UNCHANGED_PASSWORD_SENTINEL
          }
        }
      : {
          name: "",
          description: "",
          requireMfa: false,
          credentials: {
            username: "",
            password: ""
          },
          internalMetadata: {
            accountType: ActiveDirectoryAccountType.User
          }
        }
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericAccountFields />
          <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
            <Controller
              name="internalMetadata.accountType"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  className="mb-3"
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                  label="Account Type"
                >
                  <Select
                    value={value}
                    onValueChange={onChange}
                    className="w-full border border-mineshaft-500"
                  >
                    <SelectItem value={ActiveDirectoryAccountType.User}>User Account</SelectItem>
                    <SelectItem value={ActiveDirectoryAccountType.Service}>
                      Service Account
                    </SelectItem>
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
          </div>
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
