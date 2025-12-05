import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FormControl,
  Input,
  ModalClose
} from "@app/components/v2";
import { useProject } from "@app/context";
import { PamResourceType, TAwsIamAccount } from "@app/hooks/api/pam";

import { GenericAccountFields } from "./GenericAccountFields";

type Props = {
  account?: TAwsIamAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

const arnRoleRegex = /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/;

const AwsIamCredentialsSchema = z.object({
  targetRoleArn: z
    .string()
    .trim()
    .min(1, "Target Role ARN is required")
    .refine((val) => arnRoleRegex.test(val), {
      message: "ARN must be in the format 'arn:aws:iam::123456789012:role/RoleName'"
    }),
  // Max 1 hour (3600s) due to AWS role chaining limitation, min 15 min (900s)
  maxSessionDuration: z.coerce
    .number()
    .min(900, "Minimum session duration is 900 seconds (15 minutes)")
    .max(3600, "Maximum session duration is 3600 seconds (1 hour)")
    .default(3600)
});

const genericAwsIamAccountFieldsSchema = z.object({
  name: z.string().min(1, "Name is required").max(64, "Name must be at most 64 characters"),
  description: z.string().max(512).optional().nullable()
});

const formSchema = genericAwsIamAccountFieldsSchema.extend({
  credentials: AwsIamCredentialsSchema
});

type FormData = z.infer<typeof formSchema>;

export const AwsIamAccountForm = ({ account, onSubmit }: Props) => {
  const isUpdate = Boolean(account);
  const { projectId } = useProject();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account ?? {
      name: "",
      description: "",
      credentials: {
        targetRoleArn: "",
        maxSessionDuration: 3600
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
          <h4 className="mb-3 text-sm font-medium text-mineshaft-200">AWS IAM Configuration</h4>

          <Controller
            name="credentials.targetRoleArn"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                className="mb-3"
                helperText="The ARN of the IAM role that users will assume to access the AWS Console"
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Target Role ARN"
              >
                <Input
                  {...field}
                  placeholder="arn:aws:iam::123456789012:role/infisical-pam-MyTargetRole"
                  autoComplete="off"
                />
              </FormControl>
            )}
          />

          <Controller
            name="credentials.maxSessionDuration"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                className="mb-0"
                helperText="In seconds. Min 900 (15m), max 3600 (1h) due to AWS role chaining limit."
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Session Duration (seconds)"
              >
                <Input {...field} type="number" placeholder="3600" />
              </FormControl>
            )}
          />
        </div>

        <Accordion type="single" collapsible className="mb-4 w-full bg-mineshaft-700">
          <AccordionItem value="target-role-setup">
            <AccordionTrigger>Target Role Setup</AccordionTrigger>
            <AccordionContent>
              <p className="mb-3 text-sm text-mineshaft-300">
                The target role must have a trust policy that allows the Infisical PAM role to
                assume it. If you used the{" "}
                <code className="rounded bg-mineshaft-700 px-1 text-xs">infisical-pam-*</code>{" "}
                naming convention, no additional changes are needed to the PAM role.
              </p>

              <p className="mb-2 text-sm font-medium text-mineshaft-200">
                Target role trust policy:
              </p>
              <pre className="mb-3 max-h-45 overflow-y-auto rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-2 text-xs whitespace-pre-wrap text-mineshaft-300">
                {`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::<YOUR_ACCOUNT_ID>:role/<YOUR_PAM_ROLE_NAME>"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "${projectId}"
      }
    }
  }]
}`}
              </pre>
              <p className="text-xs text-mineshaft-400">
                <strong>Note:</strong> Replace{" "}
                <code className="rounded bg-mineshaft-700 px-1">&lt;YOUR_ACCOUNT_ID&gt;</code> with
                your AWS account ID and{" "}
                <code className="rounded bg-mineshaft-700 px-1">&lt;YOUR_PAM_ROLE_NAME&gt;</code>{" "}
                with the name of the PAM role you created (e.g.,{" "}
                <code className="rounded bg-mineshaft-700 px-1">InfisicalPAMRole</code>). The
                External ID <code className="rounded bg-mineshaft-700 px-1">{projectId}</code> is
                your current project ID. If your target role name doesn&apos;t follow the{" "}
                <code className="rounded bg-mineshaft-700 px-1">infisical-pam-*</code> pattern, you
                must update the PAM role&apos;s permissions policy to include the target role ARN.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="rounded-sm border border-yellow-600/30 bg-yellow-600/10 p-3">
          <p className="text-xs text-yellow-500">
            <strong>Note:</strong> While users cannot terminate AWS Console sessions directly,
            administrators can revoke active sessions by using the{" "}
            <a
              href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_revoke-sessions.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-yellow-400"
            >
              Revoke Sessions
            </a>{" "}
            feature in the IAM console. All activity is logged in AWS CloudTrail.
          </p>
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
