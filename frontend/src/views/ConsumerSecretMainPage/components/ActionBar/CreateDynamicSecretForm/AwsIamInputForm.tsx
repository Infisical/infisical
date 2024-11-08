import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, TextArea } from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
  provider: z.object({
    accessKey: z.string().trim().min(1),
    secretAccessKey: z.string().trim().min(1),
    region: z.string().trim().min(1),
    awsPath: z.string().trim().optional(),
    permissionBoundaryPolicyArn: z.string().trim().optional(),
    policyDocument: z.string().trim().optional(),
    userGroups: z.string().trim().optional(),
    policyArns: z.string().trim().optional()
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
  name: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase")
});
type TForm = z.infer<typeof formSchema>;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environment: string;
};

export const AwsIamInputForm = ({
  onCompleted,
  onCancel,
  environment,
  secretPath,
  projectSlug
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema)
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const handleCreateDynamicSecret = async ({ name, maxTTL, provider, defaultTTL }: TForm) => {
    // wait till previous request is finished
    if (createDynamicSecret.isLoading) return;
    try {
      await createDynamicSecret.mutateAsync({
        provider: { type: DynamicSecretProviders.AwsIam, inputs: provider },
        maxTTL,
        name,
        path: secretPath,
        defaultTTL,
        projectSlug,
        environmentSlug: environment
      });
      onCompleted();
    } catch (err) {
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
                    <Input {...field} placeholder="dynamic-postgres" />
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
          <div>
            <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <Controller
                  control={control}
                  name="provider.accessKey"
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
                  name="provider.secretAccessKey"
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
                  name="provider.awsPath"
                  defaultValue="/"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="AWS IAM Path"
                      className="flex-grow"
                      isOptional
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="provider.region"
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
                name="provider.permissionBoundaryPolicyArn"
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
                name="provider.userGroups"
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
                name="provider.policyArns"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="AWS Policy ARNs"
                    isError={Boolean(error?.message)}
                    isOptional
                    errorText={error?.message}
                    helperText="Generated users will get attached to given policy arns."
                  >
                    <Input
                      {...field}
                      placeholder="arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess"
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="provider.policyDocument"
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
