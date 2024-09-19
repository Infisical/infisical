import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  SecretInput,
} from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
  inputs: z.object({
    email: z.string(),
    userId: z.string(),
    tenantId: z.string(),
    applicationId: z.string(),
    clientSecret: z.string()
  }),
  defaultTTL: z.string().superRefine((val, ctx) => {
    const valMs = ms(val);
    if (valMs < 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
    // a day
    if (valMs > 24 * 60 * 60 * 1000)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
  }),
  maxTTL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      const valMs = ms(val);
      if (valMs < 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
      // a day
      if (valMs > 24 * 60 * 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
    }),
  newName: z
    .string()
    .refine((val) => val.toLowerCase() === val, "Must be lowercase")
    .optional()
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  environment: string;
  projectSlug: string;
};

export const EditDynamicSecretAzureEntraIdForm = ({
  onClose,
  dynamicSecret,
  secretPath,
  environment,
  projectSlug
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL,
      newName: dynamicSecret.name,
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"])
      }    
    }
  });

  const updateDynamicSecret = useUpdateDynamicSecret();

  const handleUpdateDynamicSecret = async ({ maxTTL, defaultTTL, newName, inputs }: TForm) => {
    // wait till previous request is finished
    if (updateDynamicSecret.isLoading) return;
    try {
      await updateDynamicSecret.mutateAsync({
        name: dynamicSecret.name,
        path: secretPath,
        projectSlug,
        environmentSlug: environment,
        data: {
          maxTTL: maxTTL || undefined,
          defaultTTL,
          newName: newName === dynamicSecret.name ? undefined : newName,
          inputs
        }
      });
      onClose();
      createNotification({
        type: "success",
        text: "Successfully updated dynamic secret"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to update dynamic secret"
      });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleUpdateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="newName"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Secret Name"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="dynamic-secret" />
                  </FormControl>
                )}
              />
            </div>
            <div className="w-32">
              <Controller
                control={control}
                name="defaultTTL"
                defaultValue="1h"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Default TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
            <div className="w-32">
              <Controller
                control={control}
                name="maxTTL"
                defaultValue="24h"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Max TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
        <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="inputs.email"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Email"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <SecretInput
                      value={field.value}
                      containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                    />
                  </FormControl>
                )}
              />
        </div>
        <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="inputs.userId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="User ID"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <SecretInput
                      isReadOnly
                      value={field.value}
                      containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                    />
                  </FormControl>
                )}
              />
        </div>
        </div>
        <div className="flex items-center space-x-2">
        <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="inputs.tenantId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Tenant ID"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <SecretInput
                      isReadOnly
                      value={field.value}
                      containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                    />
                  </FormControl>
                )}
          />
          </div>
          <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="inputs.applicationId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Application ID"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <SecretInput
                      {...field}
                      containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                    />
                  </FormControl>
                )}
              />
            </div>
        </div>
        <div className="flex items-center space-x-2">
        <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="inputs.clientSecret"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Client Secret"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <SecretInput
                      {...field}
                      containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                    />
                  </FormControl>
                )}
              />
            </div>
          </div>
      <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};