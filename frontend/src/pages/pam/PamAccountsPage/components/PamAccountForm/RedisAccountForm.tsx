import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose } from "@app/components/v2";
import { PamResourceType, TRedisAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";

type Props = {
  account?: TRedisAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericAccountFieldsSchema.extend({
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
});

type FormData = z.infer<typeof formSchema>;

export const RedisAccountForm = ({ account, onSubmit }: Props) => {
  const isUpdate = Boolean(account);

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
      : undefined
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  const [showPassword, setShowPassword] = useState(false);
  const password = useWatch({ control, name: "credentials.password" });

  useEffect(() => {
    if (password === UNCHANGED_PASSWORD_SENTINEL) {
      setShowPassword(false);
    }
  }, [password]);

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          handleSubmit(onSubmit)(e);
        }}
      >
        <GenericAccountFields />
        <div className="flex gap-2">
          <Controller
            name="credentials.username"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                className="flex-1"
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Username"
                isOptional
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
                isOptional
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
