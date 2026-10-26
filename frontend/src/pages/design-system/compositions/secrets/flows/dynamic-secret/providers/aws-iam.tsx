import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  awsIamCreateFormSchema,
  getAwsIamCreateDefaultValues,
  getAwsIamCreatePayload,
  TAwsIamFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/awsIamContract";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/schemas";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { FieldError } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import {
  DynamicSecretAwsIamAuth,
  DynamicSecretAwsIamCredentialType,
  DynamicSecretProviders
} from "@app/hooks/api/dynamicSecret/types";

import { fieldError, ProviderFields, ProviderGroup } from "../fields";
import { defineFlowProvider } from "../types";

const methodOptions = [
  { label: "Assume Role", value: DynamicSecretAwsIamAuth.AssumeRole },
  { label: "Access Key", value: DynamicSecretAwsIamAuth.AccessKey }
];

function AwsIamFields() {
  const { control, watch } = useFormContext<TAwsIamFormValues>();
  const tags = useFieldArray({ control, name: "inputs.tags" });
  const method = watch("inputs.method");
  const credentialType = watch("inputs.credentialType");
  const isIamUser = credentialType !== DynamicSecretAwsIamCredentialType.TemporaryCredentials;
  const sessionSupported = !isIamUser && method === DynamicSecretAwsIamAuth.AssumeRole;
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
    ...(isIamUser
      ? [
          {
            name: "inputs.awsPath",
            type: "text",
            label: "AWS Path",
            placeholder: "/service-accounts/",
            isOptional: true
          } as const
        ]
      : []),
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
      <ProviderGroup id="aws-iam-configuration">
        <ProviderFields fields={fields} />
      </ProviderGroup>
      {isIamUser && (
        <ProviderGroup id="aws-iam-tags" surface title="Tags">
          <Stack gap={12} align="start">
            {tags.fields.map(({ id }, index) => (
              <div key={id} className="flex w-full items-start gap-3">
                <div className="grid flex-1 grid-cols-2 gap-3">
                  {(["key", "value"] as const).map((part) => (
                    <Controller
                      key={part}
                      control={control}
                      name={`inputs.tags.${index}.${part}`}
                      render={({ field, fieldState: { error } }) => (
                        <Stack gap={4}>
                          <Input
                            {...field}
                            aria-label={`Tag ${part} ${index + 1}`}
                            placeholder={part === "key" ? "Key" : "Value"}
                            invalid={Boolean(error)}
                          />
                          {fieldError(error) && <FieldError>{fieldError(error)}</FieldError>}
                        </Stack>
                      )}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  icon="trash"
                  iconOnly
                  aria-label={`Remove tag ${index + 1}`}
                  onClick={() => tags.remove(index)}
                >
                  Remove tag {index + 1}
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              type="button"
              size="sm"
              icon="plus"
              onClick={() => tags.append({ key: "", value: "" })}
            >
              Add Tag
            </Button>
          </Stack>
        </ProviderGroup>
      )}
    </>
  );
}

export const awsIamFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.AwsIam,
  label: "AWS IAM",
  schema: awsIamCreateFormSchema,
  getDefaultValues: getAwsIamCreateDefaultValues,
  toPayload: getAwsIamCreatePayload,
  Renderer: AwsIamFields,
  submitLabel: "Submit"
});
