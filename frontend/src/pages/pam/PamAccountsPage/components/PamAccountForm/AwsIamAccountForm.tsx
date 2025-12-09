import { Controller, FormProvider, useForm } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
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
import { CopyButton } from "@app/components/v2/CopyButton";
import { useProject } from "@app/context";
import {
  PamResourceType,
  TAwsIamAccount,
  TAwsIamResource,
  useGetPamResourceById
} from "@app/hooks/api/pam";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";

const AWS_STS_MIN_SESSION_DURATION = 900; // 15 minutes
const AWS_STS_MAX_SESSION_DURATION_ROLE_CHAINING = 3600; // 1 hour

type SubmitData = {
  name: string;
  description?: string | null;
  credentials: {
    targetRoleArn: string;
    defaultSessionDuration: number;
  };
};

type Props = {
  account?: TAwsIamAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: SubmitData) => Promise<void>;
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
  defaultSessionDuration: z.string().superRefine((val, ctx) => {
    const valMs = ms(val);
    if (typeof valMs !== "number" || valMs <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid duration format. Use formats like 15m, 30m, 1h"
      });
      return;
    }
    const valSeconds = valMs / 1000;
    if (valSeconds < AWS_STS_MIN_SESSION_DURATION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Minimum session duration is 15 minutes (15m)"
      });
    }
    if (valSeconds > AWS_STS_MAX_SESSION_DURATION_ROLE_CHAINING) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum session duration is 1 hour (1h) due to AWS role chaining"
      });
    }
  })
});

const formSchema = genericAccountFieldsSchema.extend({
  credentials: AwsIamCredentialsSchema
});

type FormData = z.infer<typeof formSchema>;

export const AwsIamAccountForm = ({ account, resourceId, resourceType, onSubmit }: Props) => {
  const isUpdate = Boolean(account);
  const { projectId } = useProject();

  const resourceIdToFetch = account?.resourceId || resourceId;
  const resourceTypeToFetch = account?.resource?.resourceType || resourceType;
  const { data: resource } = useGetPamResourceById(resourceTypeToFetch, resourceIdToFetch, {
    enabled: !!resourceIdToFetch && !!resourceTypeToFetch
  });

  const pamRoleArn =
    (resource?.resourceType === PamResourceType.AwsIam &&
      (resource as TAwsIamResource).connectionDetails?.roleArn) ||
    "arn:aws:iam::<YOUR_ACCOUNT_ID>:role/<YOUR_PAM_ROLE_NAME>";

  const targetRoleTrustPolicy = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "${pamRoleArn}"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "${projectId}"
      }
    }
  }]
}`;

  // Convert seconds to human-readable format for existing accounts
  const getDefaultSessionDuration = () => {
    if (account?.credentials?.defaultSessionDuration) {
      const seconds = account.credentials.defaultSessionDuration;
      if (seconds >= 3600 && seconds % 3600 === 0) {
        return `${seconds / 3600}h`;
      }
      return `${seconds / 60}m`;
    }
    return "1h";
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: {
            ...account.credentials,
            defaultSessionDuration: getDefaultSessionDuration()
          }
        }
      : {
          name: "",
          description: "",
          credentials: {
            targetRoleArn: "",
            defaultSessionDuration: "1h"
          }
        }
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  const handleFormSubmit = async (formData: FormData) => {
    const durationMs = ms(formData.credentials.defaultSessionDuration);
    const durationSeconds = Math.floor(durationMs / 1000);

    await onSubmit({
      name: formData.name,
      description: formData.description,
      credentials: {
        targetRoleArn: formData.credentials.targetRoleArn,
        defaultSessionDuration: durationSeconds
      }
    });
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
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
            name="credentials.defaultSessionDuration"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                className="mb-0"
                helperText="Min 15m, max 1h due to AWS role chaining limit."
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label={<TtlFormLabel label="Default Session Duration" />}
              >
                <Input {...field} placeholder="1h" />
              </FormControl>
            )}
          />
        </div>

        <Accordion
          type="single"
          collapsible
          className="mb-4 w-full rounded-r border-l-2 border-l-primary bg-mineshaft-300/5"
        >
          <AccordionItem value="target-role-setup" className="border-b-0">
            <AccordionTrigger className="px-4 py-2.5 hover:no-underline [&[data-state=open]]:pb-1">
              <div className="flex items-center text-sm transition-colors duration-150 hover:text-primary">
                <FontAwesomeIcon icon={faInfoCircle} size="sm" className="mr-1.5 text-primary" />
                Target Role Setup
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-2.5">
              <p className="mb-3 text-sm text-mineshaft-300">
                The target role must have a trust policy that allows the PAM role (created in the
                &quot;Resources&quot; tab) to assume it. If your target role name follows the
                wildcard pattern you defined in the PAM role&apos;s permissions policy, no
                additional changes are needed.
              </p>

              <p className="mb-2 text-sm font-medium text-mineshaft-200">
                Target role trust policy:
              </p>
              <div className="relative mb-3">
                <div className="absolute top-1 right-3">
                  <CopyButton value={targetRoleTrustPolicy} size="sm" variant="plain" />
                </div>
                <pre className="max-h-45 overflow-y-auto rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-2 pr-8 text-xs whitespace-pre-wrap text-mineshaft-300">
                  {targetRoleTrustPolicy}
                </pre>
              </div>
              <p className="text-xs text-mineshaft-400">
                <strong>Note:</strong> The Principal role ARN shown above is from the PAM Resource
                selected for this account. The External ID{" "}
                <code className="rounded bg-mineshaft-700 px-1 font-bold">{projectId}</code> is your
                current project ID. If your target role name doesn&apos;t match the wildcard pattern
                in your PAM Resource&apos;s role&apos;s permissions policy, you&apos;ll need to
                update that policy to include this role&apos;s ARN.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

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
