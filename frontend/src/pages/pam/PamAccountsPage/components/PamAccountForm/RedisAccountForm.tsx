import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, Switch } from "@app/components/v2";
import { PamResourceType, TRedisAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";

const formSchema = genericAccountFieldsSchema
  .extend({
    credentialsEnabled: z.boolean().default(true),
    credentials: z.object({
      username: z
        .string()
        .trim()
        .max(256, "Username must be 256 characters or less")
        .transform((value) => (value === "" ? undefined : value))
        .optional(),
      password: z
        .string()
        .max(256, "Password must be 256 characters or less")
        .transform((value) => (value === "" ? undefined : value))
        .optional()
    }),
    // We don't support rotation for now, just feed a false value to
    // make the schema happy
    rotationEnabled: z.boolean().default(false)
  })
  .superRefine((data, ctx) => {
    // Make credentials required when credentialsEnabled is true
    if (data.credentialsEnabled) {
      if (!data.credentials.username || data.credentials.username.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Username is required when credentials are enabled",
          path: ["credentials", "username"]
        });
      }
      if (
        !data.credentials.password ||
        (data.credentials.password !== UNCHANGED_PASSWORD_SENTINEL &&
          data.credentials.password.trim() === "")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password is required when credentials are enabled",
          path: ["credentials", "password"]
        });
      }
    }
  });

type FormData = z.infer<typeof formSchema>;
type SubmitData = Omit<FormData, "credentialsEnabled">;

type Props = {
  account?: TRedisAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: SubmitData) => Promise<void>;
};

export const RedisAccountForm = ({ account, onSubmit }: Props) => {
  const isUpdate = Boolean(account);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentialsEnabled: Boolean(
            account.credentials?.username || account.credentials?.password
          ),
          credentials: {
            ...account.credentials,
            password: UNCHANGED_PASSWORD_SENTINEL
          }
        }
      : {
          name: "",
          description: "",
          credentialsEnabled: true,
          credentials: {
            username: undefined,
            password: undefined
          },
          rotationEnabled: false
        }
  });

  const {
    handleSubmit,
    control,
    setValue,
    clearErrors,
    formState: { isSubmitting, isDirty }
  } = form;

  const [showPassword, setShowPassword] = useState(false);
  const password = useWatch({ control, name: "credentials.password" });
  const credentialsEnabled = useWatch({ control, name: "credentialsEnabled" });

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

  const handleFormSubmit = async (data: FormData) => {
    // Remove credentialsEnabled from the data before submitting
    // If credentials are disabled, send empty credentials
    const { credentialsEnabled: isEnabled, ...rest } = data;
    const submitData: SubmitData = {
      ...rest,
      credentials: isEnabled
        ? data.credentials
        : {
            username: undefined,
            password: undefined
          }
    };
    await onSubmit(submitData);
  };

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          handleSubmit(handleFormSubmit)(e);
        }}
      >
        <GenericAccountFields />
        <Controller
          name="credentialsEnabled"
          control={control}
          render={({ field: { value, onChange } }) => (
            <div className="mt-4 mb-4">
              <Switch
                id="credentials-enabled"
                isChecked={value}
                onCheckedChange={(checked) => {
                  onChange(checked);
                  // Clear credential values when toggling
                  setValue("credentials.username", undefined, { shouldDirty: true });
                  setValue("credentials.password", undefined, { shouldDirty: true });
                  // Clear validation errors for credentials when disabled
                  if (!checked) {
                    clearErrors("credentials");
                  }
                  // Trigger validation to update form state
                  form.trigger("credentials");
                }}
              >
                Use Credentials
              </Switch>
            </div>
          )}
        />
        {credentialsEnabled && (
          <div className="mt-4 flex gap-2">
            <Controller
              name="credentials.username"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
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
                  className="flex-1"
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
        )}
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
