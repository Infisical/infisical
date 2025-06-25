import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Select, SelectItem, TextArea } from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretAwsIamAuth, TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { slugSchema } from "@app/lib/schemas";

import { MetadataForm } from "../MetadataForm";

const formSchema = z.object({
  inputs: z.discriminatedUnion("method", [
    z.object({
      method: z.literal(DynamicSecretAwsIamAuth.AccessKey),
      accessKey: z.string().trim().min(1),
      secretAccessKey: z.string().trim().min(1),
      region: z.string().trim().min(1),
      awsPath: z.string().trim().optional(),
      permissionBoundaryPolicyArn: z.string().trim().optional(),
      policyDocument: z.string().trim().optional(),
      userGroups: z.string().trim().optional(),
      policyArns: z.string().trim().optional(),
      tags: z
        .array(z.object({ key: z.string().trim().min(1), value: z.string().trim().min(1) }))
        .optional()
    }),
    z.object({
      method: z.literal(DynamicSecretAwsIamAuth.AssumeRole),
      roleArn: z.string().trim().min(1),
      region: z.string().trim().min(1),
      awsPath: z.string().trim().optional(),
      permissionBoundaryPolicyArn: z.string().trim().optional(),
      policyDocument: z.string().trim().optional(),
      userGroups: z.string().trim().optional(),
      policyArns: z.string().trim().optional(),
      tags: z
        .array(z.object({ key: z.string().trim().min(1), value: z.string().trim().min(1) }))
        .optional()
    })
  ]),
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
  newName: slugSchema().optional(),
  usernameTemplate: z.string().trim().nullable().optional()
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
    watch,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL,
      newName: dynamicSecret.name,
      usernameTemplate: dynamicSecret?.usernameTemplate || "{{randomUsername}}",
      inputs: {
        ...(dynamicSecret.inputs as TForm["inputs"])
      }
    }
  });
  const isAccessKeyMethod = watch("inputs.method") === DynamicSecretAwsIamAuth.AccessKey;

  const updateDynamicSecret = useUpdateDynamicSecret();

  const handleUpdateDynamicSecret = async ({
    inputs,
    maxTTL,
    defaultTTL,
    newName,
    usernameTemplate
  }: TForm) => {
    // wait till previous request is finished
    if (updateDynamicSecret.isPending) return;
    const isDefaultUsernameTemplate = usernameTemplate === "{{randomUsername}}";
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
          newName: newName === dynamicSecret.name ? undefined : newName,
          usernameTemplate: !usernameTemplate || isDefaultUsernameTemplate ? null : usernameTemplate
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
            <Controller
              name="inputs.method"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Method"
                >
                  <Select
                    value={value}
                    onValueChange={(val) => onChange(val)}
                    className="w-full border border-mineshaft-500"
                    position="popper"
                    dropdownContainerClassName="max-w-none"
                  >
                    <SelectItem value={DynamicSecretAwsIamAuth.AssumeRole}>
                      Assume Role (Recommended)
                    </SelectItem>
                    <SelectItem value={DynamicSecretAwsIamAuth.AccessKey}>Access Key</SelectItem>
                  </Select>
                </FormControl>
              )}
            />
            {isAccessKeyMethod ? (
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
            ) : (
              <div className="flex items-center space-x-2">
                <Controller
                  control={control}
                  name="inputs.roleArn"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Assume Role ARN"
                      className="flex-grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
              </div>
            )}
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
            <Controller
              control={control}
              name="usernameTemplate"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Username Template"
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input
                    {...field}
                    value={field.value || undefined}
                    className="border-mineshaft-600 bg-mineshaft-900 text-sm"
                  />
                </FormControl>
              )}
            />
            <MetadataForm control={control} name="inputs.tags" title="Tags" isValueRequired />
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
