import { Controller, FormProvider, useForm } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
import { CopyButton } from "@app/components/v2/CopyButton";
import { useProject } from "@app/context";
import { PamResourceType, TAwsIamResource } from "@app/hooks/api/pam";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  resource?: TAwsIamResource;
  onSubmit: (formData: FormData) => Promise<void>;
};

const arnRoleRegex = /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/;

const AwsIamConnectionDetailsSchema = z.object({
  roleArn: z
    .string()
    .trim()
    .min(1, "Resource Role ARN is required")
    .refine((val) => arnRoleRegex.test(val), {
      message: "ARN must be in the format 'arn:aws:iam::123456789012:role/RoleName'"
    })
});

const formSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  resourceType: z.literal(PamResourceType.AwsIam),
  connectionDetails: AwsIamConnectionDetailsSchema
});

type FormData = z.infer<typeof formSchema>;

// Infisical AWS account IDs for trust policy
const INFISICAL_AWS_ACCOUNT_US = "381492033652";
const INFISICAL_AWS_ACCOUNT_EU = "345594589636";

export const AwsIamResourceForm = ({ resource, onSubmit }: Props) => {
  const isUpdate = Boolean(resource);
  const { projectId } = useProject();

  const permissionsPolicy = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::<YOUR_ACCOUNT_ID>:role/*"
  }]
}`;

  const trustPolicy = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::<INFISICAL_AWS_ACCOUNT_ID>:root"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "${projectId}"
      }
    }
  }]
}`;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource ?? {
      resourceType: PamResourceType.AwsIam,
      connectionDetails: {
        roleArn: ""
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
        <Controller
          name="name"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              helperText="Name must be slug-friendly"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Name"
            >
              <Input autoFocus placeholder="my-aws-console" {...field} />
            </FormControl>
          )}
        />

        <Controller
          name="connectionDetails.roleArn"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              helperText="The ARN of the Infisical Resource Role that can assume target roles"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Resource Role ARN"
            >
              <Input
                placeholder="arn:aws:iam::123456789012:role/InfisicalResourceRole"
                {...field}
              />
            </FormControl>
          )}
        />

        <Accordion
          type="single"
          collapsible
          className="mt-4 w-full rounded-r border-l-2 border-l-primary bg-mineshaft-300/5"
        >
          <AccordionItem value="aws-iam-role-setup" className="border-b-0">
            <AccordionTrigger className="px-4 py-2.5 hover:no-underline [&[data-state=open]]:pb-1">
              <div className="flex items-center text-sm transition-colors duration-150 hover:text-primary">
                <FontAwesomeIcon icon={faInfoCircle} size="sm" className="mr-1.5 text-primary" />
                AWS IAM Role Setup
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-2.5">
              <p className="mb-3 text-sm text-mineshaft-300">
                Before creating this resource, you need to set up an IAM role in your AWS account
                that Infisical can assume. Follow these steps:
              </p>

              <p className="mb-2 text-sm font-medium text-mineshaft-200">
                Step 1: Create a permissions policy for assuming target roles
              </p>
              <p className="mb-3 text-sm text-mineshaft-300">
                This policy allows the Resource Role to assume target roles. For simplicity, use a
                wildcard to allow assuming any role in your account. For more granular control,
                replace <code className="rounded bg-mineshaft-700 px-1 text-xs">/*</code> with a
                specific pattern like{" "}
                <code className="rounded bg-mineshaft-700 px-1 text-xs">/pam-*</code> or{" "}
                <code className="rounded bg-mineshaft-700 px-1 text-xs">/infisical-*</code>.
              </p>
              <div className="relative mb-4">
                <div className="absolute top-1 right-1">
                  <CopyButton value={permissionsPolicy} size="sm" variant="plain" />
                </div>
                <pre className="max-h-45 overflow-y-auto rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-2 pr-8 text-xs whitespace-pre-wrap text-mineshaft-300">
                  {permissionsPolicy}
                </pre>
              </div>

              <p className="mb-2 text-sm font-medium text-mineshaft-200">
                Step 2: Create the Resource Role with a trust policy
              </p>
              <p className="mb-3 text-sm text-mineshaft-300">
                Create an IAM role (e.g.,{" "}
                <code className="rounded bg-mineshaft-700 px-1 text-xs">InfisicalResourceRole</code>
                ) with the permissions policy above and the following trust policy:
              </p>
              <div className="relative mb-4">
                <div className="absolute top-1 right-3">
                  <CopyButton value={trustPolicy} size="sm" variant="plain" />
                </div>
                <pre className="max-h-40 overflow-y-auto rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-2 pr-8 text-xs whitespace-pre-wrap text-mineshaft-300">
                  {trustPolicy}
                </pre>
              </div>
              <p className="text-xs text-mineshaft-400">
                <strong>Note:</strong> Use{" "}
                <code className="rounded bg-mineshaft-700 px-1 font-bold">
                  {INFISICAL_AWS_ACCOUNT_US}
                </code>{" "}
                for US region or{" "}
                <code className="rounded bg-mineshaft-700 px-1 font-bold">
                  {INFISICAL_AWS_ACCOUNT_EU}
                </code>{" "}
                for EU region. For dedicated instances, contact Infisical support. For self-hosted
                instances, use your Infisical deployment&apos;s AWS account ID. The External ID{" "}
                <code className="rounded bg-mineshaft-700 px-1 font-bold">{projectId}</code> is your
                current project ID.
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
            {isUpdate ? "Update Details" : "Create Resource"}
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
