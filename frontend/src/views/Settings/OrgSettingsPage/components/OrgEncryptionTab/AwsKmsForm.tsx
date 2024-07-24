import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useAddExternalKms, useUpdateExternalKms } from "@app/hooks/api";
import {
  AddExternalKmsSchema,
  AddExternalKmsType,
  ExternalKmsProvider,
  Kms,
  KmsAwsCredentialType
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
};

export const AwsKmsForm = ({ onCompleted, onCancel, kms }: Props) => {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<AddExternalKmsType>({
    resolver: zodResolver(AddExternalKmsSchema),
    defaultValues: {
      slug: kms?.slug,
      description: kms?.description ?? "",
      provider: {
        type: ExternalKmsProvider.AWS,
        inputs: {
          credential: {
            type: kms?.external?.providerInput?.credential?.type,
            data: {
              accessKey: kms?.external?.providerInput?.credential?.data?.accessKey,
              secretKey: kms?.external?.providerInput?.credential?.data?.secretKey,
              assumeRoleArn: kms?.external?.providerInput?.credential?.data?.assumeRoleArn,
              externalId: kms?.external?.providerInput?.credential?.data?.externalId
            }
          },
          awsRegion: kms?.external?.providerInput?.awsRegion,
          kmsKeyId: kms?.external?.providerInput?.kmsKeyId
        }
      }
    }
  });

  const { currentOrg } = useOrganization();
  const { mutateAsync: addAwsExternalKms } = useAddExternalKms(currentOrg?.id!);
  const { mutateAsync: updateAwsExternalKms } = useUpdateExternalKms(currentOrg?.id!);

  const selectedAwsAuthType = watch("provider.inputs.credential.type");

  const handleAddAwsKms = async (data: AddExternalKmsType) => {
    const { slug, description, provider } = data;
    try {
      if (kms) {
        await updateAwsExternalKms({
          kmsId: kms.id,
          slug,
          description,
          provider
        });

        createNotification({
          text: "Successfully updated AWS External KMS",
          type: "success"
        });
      } else {
        await addAwsExternalKms({
          slug,
          description,
          provider
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
    <form onSubmit={handleSubmit(handleAddAwsKms)} autoComplete="off">
      <Controller
        control={control}
        name="slug"
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
      <Controller
        control={control}
        name="provider.inputs.credential.type"
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
                setValue("provider.inputs.credential.data.accessKey", "");
                setValue("provider.inputs.credential.data.secretKey", "");
                setValue("provider.inputs.credential.data.assumeRoleArn", "");
                setValue("provider.inputs.credential.data.externalId", "");

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
            name="provider.inputs.credential.data.accessKey"
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
            name="provider.inputs.credential.data.secretKey"
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
            name="provider.inputs.credential.data.assumeRoleArn"
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
            name="provider.inputs.credential.data.externalId"
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
      <Controller
        control={control}
        name="provider.inputs.awsRegion"
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
                  {awsRegion.name} ({awsRegion.slug})
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="provider.inputs.kmsKeyId"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="AWS KMS Key ID" errorText={error?.message} isError={Boolean(error)}>
            <Input placeholder="" {...field} />
          </FormControl>
        )}
      />
      <div className="mt-6 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting}>
          Save
        </Button>
        <Button variant="outline_bg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
