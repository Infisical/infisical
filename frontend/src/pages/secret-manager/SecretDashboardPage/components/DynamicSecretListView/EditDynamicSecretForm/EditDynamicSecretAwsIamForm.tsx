import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, TextArea } from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
  inputs: z
    .object({
      accessKey: z.string().trim().min(1),
      secretAccessKey: z.string().trim().min(1),
      region: z.string().trim().min(1),
      awsPath: z.string().trim().optional(),
      permissionBoundaryPolicyArn: z.string().trim().optional(),
      policyDocument: z.string().trim().optional(),
      userGroups: z.string().trim().optional(),
      policyArns: z.string().trim().optional()
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

export const EditDynamicSecretAwsIamForm = ({
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
    if (updateDynamicSecret.isPending) return;
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
    } catch {
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
          <div className="mb-4 border-b border-b-mineshaft-600 pb-2">Configuration</div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <Controller
                control={control}
                name="inputs.accessKey"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="AWS Access Key"
                    className="flex-grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="inputs.secretAccessKey"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="AWS Secret Key"
                    className="flex-grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} type="password" />
                  </FormControl>
                )}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Controller
                control={control}
                name="inputs.awsPath"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="AWS IAM Path"
                    className="flex-grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="inputs.region"
                defaultValue="us-east-1"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="AWS Region"
                    className="flex-grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
            <Controller
              control={control}
              name="inputs.userGroups"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="AWS IAM Groups"
                  isError={Boolean(error?.message)}
                  isOptional
                  errorText={error?.message}
                  helperText="Generated users will get attached to given groups."
                >
                  <Input {...field} placeholder="group1,group2" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="inputs.permissionBoundaryPolicyArn"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="IAM User Permission Boundary ARN"
                  isError={Boolean(error?.message)}
                  isOptional
                  errorText={error?.message}
                  helperText="ARN to be attached to the generated user for AWS Permission Boundary."
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="inputs.policyArns"
              defaultValue="datacenter1"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="AWS Policy ARNs"
                  isError={Boolean(error?.message)}
                  isOptional
                  errorText={error?.message}
                  helperText="Generated users will get attached to given policy arns."
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="inputs.policyDocument"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="AWS IAM Policy Document"
                  isOptional
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                  helperText="Generated users will have the inline policy."
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
