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
import { PamResourceType, TAwsIamResource } from "@app/hooks/api/pam";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  resource?: TAwsIamResource;
  onSubmit: (formData: FormData) => Promise<void>;
};

const arnRoleRegex = /^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/;

const AwsIamConnectionDetailsSchema = z.object({
  region: z.string().trim().min(1, "Region is required"),
  roleArn: z
    .string()
    .trim()
    .min(1, "PAM Role ARN is required")
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

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource ?? {
      resourceType: PamResourceType.AwsIam,
      connectionDetails: {
        region: "",
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
          name="connectionDetails.region"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error?.message)}
              errorText={error?.message}
              label="AWS Region"
              tooltipText="This region is used for the STS endpoint and initial console URL. It does not restrict access to resources in other regions. To restrict region access, configure region conditions in the target role's IAM policy."
            >
              <Input placeholder="us-east-1" {...field} />
            </FormControl>
          )}
        />

        <Controller
          name="connectionDetails.roleArn"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              helperText="The ARN of the Infisical PAM role that can assume target roles"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="PAM Role ARN"
            >
              <Input placeholder="arn:aws:iam::123456789012:role/InfisicalPAMRole" {...field} />
            </FormControl>
          )}
        />

        <Accordion type="single" collapsible className="mt-4 w-full bg-mineshaft-700">
          <AccordionItem value="aws-iam-role-setup">
            <AccordionTrigger>AWS IAM Role Setup</AccordionTrigger>
            <AccordionContent>
              <p className="mb-3 text-sm text-mineshaft-300">
                Before creating this resource, you need to set up an IAM role in your AWS account
                that Infisical can assume. Follow these steps:
              </p>

              <p className="mb-2 text-sm font-medium text-mineshaft-200">
                Step 1: Create a permissions policy for assuming target roles
              </p>
              <p className="mb-3 text-sm text-mineshaft-300">
                This policy allows the PAM role to assume target roles. We recommend using the{" "}
                <code className="rounded bg-mineshaft-700 px-1 text-xs">infisical-pam-*</code>{" "}
                naming convention for target roles.
              </p>
              <pre className="mb-4 max-h-40 overflow-y-auto rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-2 text-xs whitespace-pre-wrap text-mineshaft-300">
                {`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::<YOUR_ACCOUNT_ID>:role/infisical-pam-*"
  }]
}`}
              </pre>

              <p className="mb-2 text-sm font-medium text-mineshaft-200">
                Step 2: Create the PAM role with a trust policy
              </p>
              <p className="mb-3 text-sm text-mineshaft-300">
                Create an IAM role (e.g.,{" "}
                <code className="rounded bg-mineshaft-700 px-1 text-xs">InfisicalPAMRole</code>)
                with the permissions policy above and the following trust policy:
              </p>
              <pre className="mb-4 max-h-40 overflow-y-auto rounded-sm border border-mineshaft-600 bg-mineshaft-800 p-2 text-xs whitespace-pre-wrap text-mineshaft-300">
                {`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::${INFISICAL_AWS_ACCOUNT_US}:root"
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
                <strong>Note:</strong> Use{" "}
                <code className="rounded bg-mineshaft-700 px-1">{INFISICAL_AWS_ACCOUNT_US}</code>{" "}
                for US region or{" "}
                <code className="rounded bg-mineshaft-700 px-1">{INFISICAL_AWS_ACCOUNT_EU}</code>{" "}
                for EU region. The External ID{" "}
                <code className="rounded bg-mineshaft-700 px-1">{projectId}</code> is your current
                project ID.
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
