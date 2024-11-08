import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FormControl,
  Input,
  SecretInput,
  TextArea
} from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
  inputs: z
    .object({
      clusterName: z.string().trim().min(1),
      accessKeyId: z.string().trim().min(1),
      secretAccessKey: z.string().trim().min(1),

      region: z.string().trim(),
      creationStatement: z.string().trim(),
      revocationStatement: z.string().trim(),
      ca: z.string().optional()
    })
    .partial(),
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
    })
    .nullable(),
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

export const EditDynamicSecretAwsElastiCacheProviderForm = ({
  onClose,
  dynamicSecret,
  environment,
  secretPath,
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

  const handleUpdateDynamicSecret = async ({ inputs, maxTTL, defaultTTL, newName }: TForm) => {
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
          inputs,
          newName: newName === dynamicSecret.name ? undefined : newName
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
        <div className="flex items-center space-x-2">
          <div className="flex-grow">
            <Controller
              control={control}
              name="newName"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Secret Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="DYN-1" />
                </FormControl>
              )}
            />
          </div>
          <div className="w-32">
            <Controller
              control={control}
              name="defaultTTL"
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
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label={<TtlFormLabel label="Max TTL" />}
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} value={field.value || ""} />
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
            <div className="flex items-center space-x-2">
              <Controller
                control={control}
                name="inputs.clusterName"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Cluster name"
                    className="flex-grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="redis-oss-cluster" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="inputs.region"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Region"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input placeholder="us-east-1" {...field} type="text" />
                  </FormControl>
                )}
              />
            </div>
            <div className="flex w-full items-center space-x-2">
              <Controller
                control={control}
                name="inputs.accessKeyId"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Access Key ID"
                    className="w-full"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} autoComplete="off" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="inputs.secretAccessKey"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Secret Access Key"
                    className="w-full"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} type="password" autoComplete="new-password" />
                  </FormControl>
                )}
              />
            </div>
            <div>
              <Controller
                control={control}
                name="inputs.ca"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isOptional
                    label="CA(SSL)"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <SecretInput
                      {...field}
                      containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                    />
                  </FormControl>
                )}
              />
              <Accordion type="single" collapsible className="mb-2 w-full bg-mineshaft-700">
                <AccordionItem value="advance-statements">
                  <AccordionTrigger>Modify ElastiCache Statements</AccordionTrigger>
                  <AccordionContent>
                    <Controller
                      control={control}
                      name="inputs.creationStatement"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Creation Statement"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                          helperText="username, password and expiration are dynamically provisioned"
                        >
                          <TextArea
                            {...field}
                            reSize="none"
                            rows={3}
                            className="border-mineshaft-600 bg-mineshaft-900 text-sm"
                          />
                        </FormControl>
                      )}
                    />
                    <Controller
                      control={control}
                      name="inputs.revocationStatement"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label="Revocation Statement"
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                          helperText="username is dynamically provisioned"
                        >
                          <TextArea
                            {...field}
                            reSize="none"
                            rows={3}
                            className="border-mineshaft-600 bg-mineshaft-900 text-sm"
                          />
                        </FormControl>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Save
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
