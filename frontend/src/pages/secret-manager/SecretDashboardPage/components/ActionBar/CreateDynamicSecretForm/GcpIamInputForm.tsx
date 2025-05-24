import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Input } from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { WorkspaceEnv } from "@app/hooks/api/types";

const validateTTL = (val: string, ctx: z.RefinementCtx) => {
  if (!val) return;
  const valMs = ms(val);
  if (valMs === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid TTL format" });
    return;
  }
  if (valMs < 1000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1 second" });
  if (valMs > 60 * 60 * 1000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 1 hour" });
};

const formSchema = z
  .object({
    provider: z.object({
      serviceAccountEmail: z.string().email().trim().min(1, "Service account email required")
    }),
    defaultTTL: z.string().superRefine(validateTTL),
    maxTTL: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (val) validateTTL(val, ctx);
      }),
    name: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase"),
    environment: z.object({ name: z.string(), slug: z.string() })
  })
  .refine((d) => !d.maxTTL || ms(d.maxTTL)! >= ms(d.defaultTTL)!, {
    path: ["maxTTL"],
    message: "Max TTL must be greater than or equal to Default TTL"
  });
type TForm = z.infer<typeof formSchema>;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environments: WorkspaceEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const GcpIamInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      environment: isSingleEnvironmentMode && environments.length > 0 ? environments[0] : undefined
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({
    name,
    maxTTL,
    provider,
    defaultTTL,
    environment
  }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isPending) return;
    try {
      await createDynamicSecret.mutateAsync({
        provider: {
          type: DynamicSecretProviders.GcpIam,
          inputs: {
            ...provider
          }
        },
        maxTTL,
        name,
        path: secretPath,
        defaultTTL,
        projectSlug,
        environmentSlug: environment.slug
      });
      onCompleted();
    } catch {
      createNotification({
        type: "error",
        text: "Failed to create dynamic secret"
      });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="flex-grow">
              <Controller
                control={control}
                defaultValue=""
                name="name"
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
                defaultValue="30m"
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
                defaultValue="1h"
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
          <div>
            <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>

            <div className="flex flex-col">
              <Controller
                control={control}
                name="provider.serviceAccountEmail"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Service Account Email"
                    className="flex-grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText={
                      <span>
                        Don&apos;t know where to get this value?{" "}
                        <a
                          href="https://infisical.com/docs/documentation/platform/dynamic-secrets/gcp-iam#param-service-account-email"
                          target="_blank"
                          className="underline"
                          rel="noreferrer"
                        >
                          Read our docs
                        </a>
                      </span>
                    }
                  >
                    <Input placeholder="example@project.iam.gserviceaccount.com" {...field} />
                  </FormControl>
                )}
              />
            </div>

            {!isSingleEnvironmentMode && (
              <Controller
                control={control}
                name="environment"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Environment"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <FilterableSelect
                      options={environments}
                      value={value}
                      onChange={onChange}
                      placeholder="Select the environment to create secret in..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.slug}
                      menuPlacement="top"
                    />
                  </FormControl>
                )}
              />
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
