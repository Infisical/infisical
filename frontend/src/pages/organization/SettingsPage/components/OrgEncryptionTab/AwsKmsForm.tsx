import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useAddExternalKms, useUpdateExternalKms } from "@app/hooks/api";
import {
  AddExternalKmsSchema,
  AddExternalKmsType,
  ExternalKmsProvider,
  Kms,
  KmsAwsCredentialType,
  UpdateExternalKmsSchema
} from "@app/hooks/api/kms/types";

const AWS_REGIONS = [
  { name: "US East (Ohio)", slug: "us-east-2" },
  { name: "US East (N. Virginia)", slug: "us-east-1" },
  { name: "US West (N. California)", slug: "us-west-1" },
  { name: "US West (Oregon)", slug: "us-west-2" },
  { name: "Africa (Cape Town)", slug: "af-south-1" },
  { name: "Asia Pacific (Hong Kong)", slug: "ap-east-1" },
  { name: "Asia Pacific (Hyderabad)", slug: "ap-south-2" },
  { name: "Asia Pacific (Jakarta)", slug: "ap-southeast-3" },
  { name: "Asia Pacific (Melbourne)", slug: "ap-southeast-4" },
  { name: "Asia Pacific (Mumbai)", slug: "ap-south-1" },
  { name: "Asia Pacific (Osaka)", slug: "ap-northeast-3" },
  { name: "Asia Pacific (Seoul)", slug: "ap-northeast-2" },
  { name: "Asia Pacific (Singapore)", slug: "ap-southeast-1" },
  { name: "Asia Pacific (Sydney)", slug: "ap-southeast-2" },
  { name: "Asia Pacific (Tokyo)", slug: "ap-northeast-1" },
  { name: "Canada (Central)", slug: "ca-central-1" },
  { name: "Europe (Frankfurt)", slug: "eu-central-1" },
  { name: "Europe (Ireland)", slug: "eu-west-1" },
  { name: "Europe (London)", slug: "eu-west-2" },
  { name: "Europe (Milan)", slug: "eu-south-1" },
  { name: "Europe (Paris)", slug: "eu-west-3" },
  { name: "Europe (Spain)", slug: "eu-south-2" },
  { name: "Europe (Stockholm)", slug: "eu-north-1" },
  { name: "Europe (Zurich)", slug: "eu-central-2" },
  { name: "Middle East (Bahrain)", slug: "me-south-1" },
  { name: "Middle East (UAE)", slug: "me-central-1" },
  { name: "South America (Sao Paulo)", slug: "sa-east-1" },
  { name: "AWS GovCloud (US-East)", slug: "us-gov-east-1" },
  { name: "AWS GovCloud (US-West)", slug: "us-gov-west-1" }
];

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  kms?: Kms;
  mode?: "full" | "credentials" | "details";
};

export const AwsKmsForm = ({ onCompleted, onCancel, kms, mode = "full" }: Props) => {
  const validationSchema = kms ? UpdateExternalKmsSchema : AddExternalKmsSchema;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<AddExternalKmsType>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      name: kms?.name,
      description: kms?.description ?? "",
      configuration: {
        type: ExternalKmsProvider.Aws,
        inputs: {
          ...(mode !== "details" &&
          kms?.externalKms?.configuration?.credential?.type &&
          kms.externalKms.configuration.credential.data
            ? {
                credential: {
                  type: kms.externalKms.configuration.credential.type,
                  data: {
                    accessKey: kms.externalKms.configuration.credential.data?.accessKey ?? "",
                    secretKey: kms.externalKms.configuration.credential.data?.secretKey ?? "",
                    assumeRoleArn:
                      kms.externalKms.configuration.credential.data?.assumeRoleArn ?? "",
                    externalId: kms.externalKms.configuration.credential.data?.externalId ?? ""
                  }
                }
              }
            : {}),
          ...(mode !== "credentials"
            ? {
                awsRegion: kms?.externalKms?.configuration?.awsRegion ?? "",
                kmsKeyId: kms?.externalKms?.configuration?.kmsKeyId ?? ""
              }
            : {})
        }
      }
    }
  });

  const { currentOrg } = useOrganization();
  const { mutateAsync: addAwsExternalKms } = useAddExternalKms(currentOrg.id);
  const { mutateAsync: updateAwsExternalKms } = useUpdateExternalKms(
    currentOrg.id,
    ExternalKmsProvider.Aws
  );

  const selectedAwsAuthType = watch("configuration.inputs.credential.type");

  const handleAwsKmsFormSubmit = async (data: AddExternalKmsType) => {
    const { name, description, configuration } = data;
    try {
      if (kms) {
        if (configuration.type !== ExternalKmsProvider.Aws) {
          throw new Error("Invalid configuration type");
        }
        const awsInputs = configuration.inputs;

        if (mode === "credentials") {
          await updateAwsExternalKms({
            kmsId: kms.id,
            configuration: {
              type: ExternalKmsProvider.Aws,
              inputs: {
                credential: { ...awsInputs.credential }
              }
            }
          });
        } else {
          await updateAwsExternalKms({
            kmsId: kms.id,
            name,
            description,
            configuration: {
              type: ExternalKmsProvider.Aws,
              inputs: {
                awsRegion: awsInputs.awsRegion,
                kmsKeyId: awsInputs.kmsKeyId
              }
            }
          });
        }

        createNotification({
          text:
            mode === "credentials"
              ? "Successfully updated AWS External KMS credentials"
              : "Successfully updated AWS External KMS Details",
          type: "success"
        });
      } else {
        await addAwsExternalKms({
          name,
          description,
          configuration
        });

        createNotification({
          text: "Successfully added AWS External KMS",
          type: "success"
        });
      }

      onCompleted();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleAwsKmsFormSubmit)} autoComplete="off">
      {(mode === "full" || mode === "details") && (
        <>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Alias" errorText={error?.message} isError={Boolean(error)}>
                <Input placeholder="" {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Description" errorText={error?.message} isError={Boolean(error)}>
                <Input placeholder="" {...field} />
              </FormControl>
            )}
          />
        </>
      )}
      {(mode === "full" || mode === "credentials") && (
        <>
          <Controller
            control={control}
            name="configuration.inputs.credential.type"
            defaultValue={KmsAwsCredentialType.AssumeRole}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Authentication Mode"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => {
                    setValue("configuration.inputs.credential.data.accessKey", "");
                    setValue("configuration.inputs.credential.data.secretKey", "");
                    setValue("configuration.inputs.credential.data.assumeRoleArn", "");
                    setValue("configuration.inputs.credential.data.externalId", "");

                    onChange(e);
                  }}
                  className="w-full"
                >
                  <SelectItem value={KmsAwsCredentialType.AssumeRole}>AWS Assume Role</SelectItem>
                  <SelectItem value={KmsAwsCredentialType.AccessKey}>Access Key</SelectItem>
                </Select>
              </FormControl>
            )}
          />

          {selectedAwsAuthType === KmsAwsCredentialType.AccessKey ? (
            <>
              <Controller
                control={control}
                name="configuration.inputs.credential.data.accessKey"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Access Key ID"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Input placeholder="" {...field} />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="configuration.inputs.credential.data.secretKey"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Secret Access Key"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Input type="password" autoComplete="new-password" placeholder="" {...field} />
                  </FormControl>
                )}
              />
            </>
          ) : (
            <>
              <Controller
                control={control}
                name="configuration.inputs.credential.data.assumeRoleArn"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="IAM Role ARN For Role Assumption"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Input placeholder="" {...field} />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="configuration.inputs.credential.data.externalId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Assume Role External ID"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Input placeholder="" {...field} />
                  </FormControl>
                )}
              />
            </>
          )}
        </>
      )}
      {(mode === "full" || mode === "details") && (
        <>
          <Controller
            control={control}
            name="configuration.inputs.awsRegion"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="AWS Region" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full border border-mineshaft-500"
                >
                  {AWS_REGIONS.map((awsRegion) => (
                    <SelectItem value={awsRegion.slug} key={`kms-aws-region-${awsRegion.slug}`}>
                      {awsRegion.name} <Badge variant="neutral">{awsRegion.slug}</Badge>
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="configuration.inputs.kmsKeyId"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="AWS KMS Key ID"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input placeholder="" {...field} />
              </FormControl>
            )}
          />
        </>
      )}
      <div className="mt-6 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting}>
          {mode === "credentials" ? "Update Credentials" : "Save"}
        </Button>
        <Button variant="outline_bg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
