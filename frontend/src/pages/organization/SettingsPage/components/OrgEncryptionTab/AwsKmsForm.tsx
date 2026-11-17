import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Code,
  CopyButton,
  DialogFooter,
  DocumentationLinkBadge,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter
} from "@app/components/v3";
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
  { name: "AWS GovCloud (US-West)", slug: "us-gov-west-1" },
  { name: "AWS US ISOB (East)", slug: "us-isob-east-1" },
  { name: "AWS US ISOB (West)", slug: "us-isob-west-1" },
  { name: "AWS US ISO (East)", slug: "us-iso-east-1" },
  { name: "AWS US ISO (West)", slug: "us-iso-west-1" }
];

const AWS_KMS_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/kms-configuration/aws-kms";

type AwsKmsCredential = Extract<
  AddExternalKmsType["configuration"],
  { type: ExternalKmsProvider.Aws }
>["inputs"]["credential"];

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  kms?: Kms;
  mode?: "full" | "credentials" | "details";
  layout?: "dialog" | "sheet";
  secondaryActionLabel?: string;
};

export const AwsKmsForm = ({
  onCompleted,
  onCancel,
  kms,
  mode = "full",
  layout = "dialog",
  secondaryActionLabel = "Cancel"
}: Props) => {
  const validationSchema = kms ? UpdateExternalKmsSchema : AddExternalKmsSchema;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<AddExternalKmsType>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      name: kms?.name ?? "",
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
                      kms.externalKms.configuration.credential.data?.assumeRoleArn ?? ""
                  }
                }
              }
            : {}),
          ...(mode !== "details"
            ? {
                awsRegion: kms?.externalKms?.configuration?.awsRegion ?? "",
                kmsKeyId: kms?.externalKms?.configuration?.kmsKeyId ?? ""
              }
            : {})
        }
      }
    }
  });

  const { currentOrg, isSubOrganization } = useOrganization();
  const { mutateAsync: addAwsExternalKms } = useAddExternalKms(currentOrg.id);
  const { mutateAsync: updateAwsExternalKms } = useUpdateExternalKms(
    currentOrg.id,
    ExternalKmsProvider.Aws
  );

  const selectedAwsAuthType = watch("configuration.inputs.credential.type");
  const hasLegacyExternalId = Boolean(kms?.externalKms?.hasLegacyExternalId);
  const storedExternalId: string | undefined =
    kms?.externalKms?.configuration?.credential?.data?.externalId;

  const withOrgExternalId = (credential: AwsKmsCredential): AwsKmsCredential =>
    credential.type === KmsAwsCredentialType.AssumeRole
      ? { ...credential, data: { ...credential.data, externalId: currentOrg.id } }
      : credential;

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
                credential: awsInputs.credential && withOrgExternalId(awsInputs.credential),
                awsRegion: awsInputs.awsRegion,
                kmsKeyId: awsInputs.kmsKeyId
              }
            }
          });
        } else {
          await updateAwsExternalKms({
            kmsId: kms.id,
            name,
            description
          });
        }

        createNotification({
          text:
            mode === "credentials"
              ? "AWS external KMS credentials updated"
              : "AWS external KMS details updated",
          type: "success"
        });
      } else {
        await addAwsExternalKms({
          name,
          description,
          configuration:
            configuration.type === ExternalKmsProvider.Aws
              ? {
                  ...configuration,
                  inputs: {
                    ...configuration.inputs,
                    credential: withOrgExternalId(configuration.inputs.credential)
                  }
                }
              : configuration
        });

        createNotification({
          text: "AWS external KMS created",
          type: "success"
        });
      }

      onCompleted();
    } catch {
      createNotification({
        text: kms ? "Failed to update AWS external KMS" : "Failed to create AWS external KMS",
        type: "error"
      });
    }
  };

  let submitLabel = "Add KMS";
  if (kms) submitLabel = "Save Changes";
  if (mode === "credentials") submitLabel = "Update Credentials";

  const formActions = (
    <>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {secondaryActionLabel}
      </Button>
      <Button
        type="submit"
        variant={isSubOrganization ? "sub-org" : "org"}
        isPending={isSubmitting}
        isDisabled={
          isSubmitting ||
          Boolean(kms && !isDirty && !(mode === "credentials" && hasLegacyExternalId))
        }
      >
        {submitLabel}
      </Button>
    </>
  );

  return (
    <form
      onSubmit={handleSubmit(handleAwsKmsFormSubmit)}
      autoComplete="off"
      className={layout === "sheet" ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-4"}
    >
      <FieldGroup
        className={layout === "sheet" ? "flex-1 overflow-y-auto px-4 pt-4 pb-12" : undefined}
      >
        {(mode === "full" || mode === "details") && (
          <>
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="aws-kms-alias">Alias</FieldLabel>
                  <Input
                    {...field}
                    id="aws-kms-alias"
                    value={field.value ?? ""}
                    isError={Boolean(error)}
                    placeholder="production-kms"
                    autoComplete="off"
                    name="aws-kms-alias"
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="aws-kms-description">Description</FieldLabel>
                  <Input
                    {...field}
                    id="aws-kms-description"
                    value={field.value ?? ""}
                    isError={Boolean(error)}
                    placeholder="KMS for production organization data"
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
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
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="aws-kms-auth-mode">Authentication Mode</FieldLabel>
                  <Select
                    value={value}
                    onValueChange={(nextValue) => {
                      setValue("configuration.inputs.credential.data.accessKey", "");
                      setValue("configuration.inputs.credential.data.secretKey", "");
                      setValue("configuration.inputs.credential.data.assumeRoleArn", "");
                      onChange(nextValue);
                    }}
                  >
                    <SelectTrigger
                      id="aws-kms-auth-mode"
                      className="w-full"
                      isError={Boolean(error)}
                    >
                      <SelectValue placeholder="Select an authentication mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KmsAwsCredentialType.AssumeRole}>
                        AWS Assume Role
                      </SelectItem>
                      <SelectItem value={KmsAwsCredentialType.AccessKey}>Access Key</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            {selectedAwsAuthType === KmsAwsCredentialType.AccessKey ? (
              <>
                <Controller
                  control={control}
                  name="configuration.inputs.credential.data.accessKey"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="aws-kms-access-key">Access Key ID</FieldLabel>
                      <Input
                        {...field}
                        id="aws-kms-access-key"
                        value={field.value ?? ""}
                        isError={Boolean(error)}
                        autoComplete="off"
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="configuration.inputs.credential.data.secretKey"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="aws-kms-secret-key">Secret Access Key</FieldLabel>
                      <SecretInput
                        {...field}
                        id="aws-kms-secret-key"
                        value={field.value ?? ""}
                        containerClassName={error ? "border-danger" : undefined}
                        autoComplete="new-password"
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </>
            ) : (
              <>
                <Controller
                  control={control}
                  name="configuration.inputs.credential.data.assumeRoleArn"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="aws-kms-role-arn">IAM Role ARN</FieldLabel>
                      <Input
                        {...field}
                        id="aws-kms-role-arn"
                        value={field.value ?? ""}
                        isError={Boolean(error)}
                        placeholder="arn:aws:iam::123456789012:role/InfisicalKms"
                      />
                      <FieldDescription>
                        Infisical sends your{" "}
                        <HoverCard openDelay={150} closeDelay={150}>
                          <HoverCardTrigger asChild>
                            <span className="cursor-help text-foreground underline decoration-muted decoration-dotted underline-offset-4">
                              organization ID
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent align="start" className="w-auto max-w-sm">
                            <p className="text-xs font-medium text-foreground">External ID</p>
                            <div className="mt-1 flex items-center gap-1">
                              <span className="font-mono text-xs">{currentOrg.id}</span>
                              <CopyButton value={currentOrg.id} ariaLabel="Copy organization ID" />
                            </div>
                            <p className="mt-2 text-xs text-muted">
                              Require it in the role&apos;s trust policy with the{" "}
                              <Code>sts:ExternalId</Code> condition.
                            </p>
                          </HoverCardContent>
                        </HoverCard>{" "}
                        as the External ID when it assumes this role.
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                {hasLegacyExternalId && (
                  <Alert variant="warning">
                    <TriangleAlertIcon />
                    <AlertTitle>
                      {storedExternalId
                        ? "External ID Not Tied to This Organization"
                        : "No External ID on This Key"}
                    </AlertTitle>
                    <AlertDescription>
                      {storedExternalId ? (
                        <p>
                          This key keeps working with its current external ID. Before updating its
                          credentials, add your organization ID to the role&apos;s trust policy next
                          to the current value. Remove the old value after the update.
                        </p>
                      ) : (
                        <p>
                          This key keeps working without an external ID. Update its credentials
                          first so Infisical sends your organization ID, then require that value in
                          the role&apos;s trust policy.
                        </p>
                      )}
                      <DocumentationLinkBadge
                        href={`${AWS_KMS_DOCS_URL}#update-the-external-id-of-an-existing-aws-kms-key`}
                      />
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </>
        )}
        {(mode === "full" || mode === "credentials") && (
          <>
            <Controller
              control={control}
              name="configuration.inputs.awsRegion"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="aws-kms-region">AWS Region</FieldLabel>
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger id="aws-kms-region" className="w-full" isError={Boolean(error)}>
                      <SelectValue placeholder="Select an AWS region" />
                    </SelectTrigger>
                    <SelectContent>
                      {AWS_REGIONS.map((awsRegion) => (
                        <SelectItem value={awsRegion.slug} key={`kms-aws-region-${awsRegion.slug}`}>
                          <span>{awsRegion.name}</span>
                          <Badge variant="neutral">{awsRegion.slug}</Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="configuration.inputs.kmsKeyId"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="aws-kms-key-id">AWS KMS Key ID</FieldLabel>
                  <Input
                    {...field}
                    id="aws-kms-key-id"
                    value={field.value ?? ""}
                    isError={Boolean(error)}
                    placeholder="Optional"
                  />
                  <FieldDescription>
                    Leave blank to create a new AWS KMS key automatically.
                  </FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          </>
        )}
      </FieldGroup>
      {layout === "sheet" ? (
        <SheetFooter className="justify-end border-t">{formActions}</SheetFooter>
      ) : (
        <DialogFooter>{formActions}</DialogFooter>
      )}
    </form>
  );
};
