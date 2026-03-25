import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose } from "@app/components/v2";
import { PamResourceType, TMongoDBAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";
import { MetadataFields } from "./MetadataFields";

const formSchema = genericAccountFieldsSchema.extend({
  credentials: z.object({
    username: z
      .string()
      .trim()
      .min(1, "Username is required")
      .max(256, "Username must be 256 characters or less"),
    password: z
      .string()
      .min(1, "Password is required")
      .max(256, "Password must be 256 characters or less")
  }),
  rotationEnabled: z.boolean().default(false)
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  account?: TMongoDBAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

export const MongoDBAccountForm = ({ account, onSubmit }: Props) => {
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
      : {
          name: "",
          description: "",
          credentials: {
            username: "",
            password: ""
          },
          rotationEnabled: false
        }
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
        <MetadataFields />
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
