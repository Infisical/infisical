import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button, Field, FieldError, FieldLabel, IconButton, Input } from "@app/components/v3";
import { useGetServerConfig } from "@app/hooks/api/admin";
import {
  DynamicSecretAwsIamAuth,
  DynamicSecretAwsIamCredentialType,
  DynamicSecretProviders
} from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import { defineDynamicSecretProvider, TDynamicSecretProviderField } from "../types";
import {
  AWS_IAM_CUSTOM_RENDERER_REASONS,
  awsIamCreateFormSchema,
  awsIamEditFormSchema,
  getAwsIamCreateDefaultValues,
  getAwsIamCreatePayload,
  getAwsIamEditDefaultValues,
  getAwsIamEditPayload,
  TAwsIamFormValues
} from "./awsIamContract";

const AwsIamFields = () => {
  const { data: serverConfig } = useGetServerConfig();
  const { control, watch } = useFormContext<TAwsIamFormValues>();
  const tags = useFieldArray({ control, name: "inputs.tags" });
  const method = watch("inputs.method");
  const credentialType = watch("inputs.credentialType");
  const isIamUser = credentialType !== DynamicSecretAwsIamCredentialType.TemporaryCredentials;
  const sessionSupported = !isIamUser && method === DynamicSecretAwsIamAuth.AssumeRole;
  const methodOptions = [
    { label: "Assume Role", value: DynamicSecretAwsIamAuth.AssumeRole },
    { label: "Access Key", value: DynamicSecretAwsIamAuth.AccessKey },
    ...(serverConfig?.kubernetesAutoFetchServiceAccountToken
      ? [{ label: "IRSA", value: DynamicSecretAwsIamAuth.IRSA }]
      : [])
  ];
  const fields: TDynamicSecretProviderField<TAwsIamFormValues>[] = [
    {
      name: "inputs.method",
      type: "select",
      label: "Authentication Method",
      options: methodOptions
    },
    {
      name: "inputs.credentialType",
      type: "select",
      label: "Credential Type",
      options: [
        { label: "IAM User", value: DynamicSecretAwsIamCredentialType.IamUser },
        {
          label: "Temporary Credentials",
          value: DynamicSecretAwsIamCredentialType.TemporaryCredentials
        }
      ]
    },
    ...(method === DynamicSecretAwsIamAuth.AccessKey
      ? [
          {
            name: "inputs.accessKey",
            type: "text",
            label: "Access Key",
            placeholder: "AKIA...",
            layout: "half"
          } as const,
          {
            name: "inputs.secretAccessKey",
            type: "secret",
            label: "Secret Access Key",
            placeholder: "Enter secret access key",
            layout: "half",
            autoComplete: "new-password"
          } as const
        ]
      : []),
    ...(method === DynamicSecretAwsIamAuth.AssumeRole
      ? [
          {
            name: "inputs.roleArn",
            type: "text",
            label: "Role ARN",
            placeholder: "arn:aws:iam::123456789012:role/example-role"
          } as const
        ]
      : []),
    ...(!isIamUser
      ? []
      : [
          {
            name: "inputs.awsPath",
            type: "text",
            label: "AWS Path",
            placeholder: "/service-accounts/",
            isOptional: true
          } as const
        ]),
    { name: "inputs.region", type: "text", label: "Region", placeholder: "us-east-1" },
    {
      name: "inputs.permissionBoundaryPolicyArn",
      type: "text",
      label: "Permission Boundary Policy ARN",
      placeholder: "arn:aws:iam::123456789012:policy/example-policy",
      isOptional: true
    },
    ...(isIamUser
      ? ([
          {
            name: "inputs.userGroups",
            type: "text",
            label: "AWS IAM Groups",
            placeholder: "developers,operators",
            isOptional: true
          },
          {
            name: "inputs.policyArns",
            type: "textarea",
            label: "AWS Policy ARNs",
            isOptional: true
          },
          {
            name: "inputs.policyDocument",
            type: "textarea",
            label: "AWS IAM Policy Document",
            isOptional: true
          }
        ] as const)
      : []),
    ...(sessionSupported
      ? ([
          {
            name: "inputs.sessionPolicyArns",
            type: "textarea",
            label: "AWS Session Policy ARNs",
            isOptional: true
          },
          {
            name: "inputs.sessionPolicyDocument",
            type: "textarea",
            label: "AWS Session Policy Document",
            isOptional: true
          }
        ] as const)
      : []),
    ...(isIamUser
      ? ([
          {
            name: "usernameTemplate",
            type: "text",
            label: "Username Template",
            placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
          }
        ] as const)
      : [])
  ];
  return (
    <>
      <DynamicSecretProviderGroup id="aws-iam-configuration" presentation="panel">
        <DynamicSecretProviderFields fields={fields} />
      </DynamicSecretProviderGroup>
      {isIamUser && (
        <DynamicSecretProviderGroup id="aws-iam-tags" presentation="panel" surface title="Tags">
          <div className="flex flex-col gap-3">
            {tags.fields.map(({ id }, index) => (
              <div
                key={id}
                className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <Controller
                  control={control}
                  name={`inputs.tags.${index}.key`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`aws-tag-key-${index}`} className="sr-only">
                        Tag key {index + 1}
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`aws-tag-key-${index}`}
                        placeholder="Key"
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`inputs.tags.${index}.value`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`aws-tag-value-${index}`} className="sr-only">
                        Tag value {index + 1}
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`aws-tag-value-${index}`}
                        placeholder="Value"
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <div className="flex flex-col gap-2">
                  <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                    &nbsp;
                  </FieldLabel>
                  <IconButton
                    type="button"
                    variant="outline"
                    aria-label={`Remove tag ${index + 1}`}
                    onClick={() => tags.remove(index)}
                  >
                    <Trash2Icon />
                  </IconButton>
                </div>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              className="self-start"
              onClick={() => tags.append({ key: "", value: "" })}
            >
              <PlusIcon />
              Add Tag
            </Button>
          </div>
        </DynamicSecretProviderGroup>
      )}
    </>
  );
};

export const awsIamDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AwsIam,
  label: "AWS IAM",
  customRenderer: {
    reasons: AWS_IAM_CUSTOM_RENDERER_REASONS,
    Component: AwsIamFields
  },
  create: {
    schema: awsIamCreateFormSchema,
    getDefaultValues: getAwsIamCreateDefaultValues,
    toPayload: getAwsIamCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: awsIamEditFormSchema,
    getDefaultValues: getAwsIamEditDefaultValues,
    toPayload: getAwsIamEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});
