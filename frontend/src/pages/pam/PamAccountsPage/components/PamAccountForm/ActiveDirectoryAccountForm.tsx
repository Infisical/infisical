import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, Select, SelectItem } from "@app/components/v2";
import { PamResourceType, TActiveDirectoryAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { ActiveDirectoryAccountType } from "@app/hooks/api/pam/types/active-directory-resource";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";
import { RequireMfaField } from "./RequireMfaField";

type Props = {
  account?: TActiveDirectoryAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericAccountFieldsSchema.extend({
  credentials: z.object({
    username: z.string().trim().min(1, "Username is required"),
    password: z.string().trim().min(1, "Password is required")
  }),
  metadata: z.object({
    accountType: z.nativeEnum(ActiveDirectoryAccountType)
  }),
  rotationEnabled: z.boolean().default(false),
  requireMfa: z.boolean().nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

export const ActiveDirectoryAccountForm = ({ account, onSubmit }: Props) => {
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
          rotationEnabled: false,
          credentials: {
            username: "",
            password: ""
          },
          metadata: {
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
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericAccountFields />
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
          <Controller
            name="metadata.accountType"
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
        <div className="mt-6 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Account" : "Create Account"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
