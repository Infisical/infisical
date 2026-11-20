import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  ProviderIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

enum AwsAuthType {
  AccessKey = "access-key",
  AssumeRole = "assume-role"
}

const formSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(AwsAuthType.AccessKey),
    accessKey: z.string().min(1),
    accessSecretKey: z.string().min(1)
  }),
  z.object({
    type: z.literal(AwsAuthType.AssumeRole),
    iamRoleArn: z.string().min(1)
  })
]);

type TForm = z.infer<typeof formSchema>;

export const AWSParameterStoreAuthorizeIntegrationPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const { control, handleSubmit, formState, watch } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: AwsAuthType.AccessKey
    }
  });

  const formAwsAuthTypeField = watch("type");

  const handleFormSubmit = async (data: TForm) => {
    try {
      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "aws-parameter-store",
        ...(data.type === AwsAuthType.AssumeRole
          ? {
              awsAssumeIamRoleArn: data.iamRoleArn
            }
          : {
              accessId: data.accessKey,
              accessToken: data.accessSecretKey
            })
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/aws-parameter-store/create",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          integrationAuthId: integrationAuth.id
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Authorize AWS Parameter Store Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <ProviderIcon icon="Amazon Web Services.png" height={35} width={35} alt="AWS logo" />
            <span>AWS Parameter Store Integration</span>
          </CardTitle>
          <CardDescription>
            After adding the details below, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/integrations/cloud/aws-parameter-store"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-5">
          <CardContent>
            <Controller
              control={control}
              name="type"
              defaultValue={AwsAuthType.AccessKey}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="awsparameterstore-type">Authentication Mode</FieldLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={(e) => onChange(e)}
                    name={field.name}
                    disabled={field.disabled}
                    value={field.value}
                  >
                    <SelectTrigger
                      className="w-full"
                      id="awsparameterstore-type"
                      isError={Boolean(error)}
                      aria-describedby={error ? "awsparameterstore-type-error" : undefined}
                      ref={field.ref}
                      onBlur={field.onBlur}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AwsAuthType.AccessKey}>Access Key</SelectItem>
                      <SelectItem value={AwsAuthType.AssumeRole}>AWS Assume Role</SelectItem>
                    </SelectContent>
                  </Select>
                  {Boolean(error) && (
                    <FieldError id="awsparameterstore-type-error">{error?.message}</FieldError>
                  )}
                </Field>
              )}
            />
            {formAwsAuthTypeField === AwsAuthType.AccessKey ? (
              <>
                <Controller
                  control={control}
                  name="accessKey"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="mb-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="awsparameterstore-accesskey">Access Key ID</FieldLabel>
                      <Input
                        placeholder=""
                        {...field}
                        id="awsparameterstore-accesskey"
                        isError={Boolean(error)}
                        aria-describedby={error ? "awsparameterstore-accesskey-error" : undefined}
                      />
                      {Boolean(error) && (
                        <FieldError id="awsparameterstore-accesskey-error">
                          {error?.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="accessSecretKey"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="mb-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="awsparameterstore-accesssecretkey">
                        Secret Access Key
                      </FieldLabel>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder=""
                        {...field}
                        id="awsparameterstore-accesssecretkey"
                        isError={Boolean(error)}
                        aria-describedby={
                          error ? "awsparameterstore-accesssecretkey-error" : undefined
                        }
                      />
                      {Boolean(error) && (
                        <FieldError id="awsparameterstore-accesssecretkey-error">
                          {error?.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
              </>
            ) : (
              <Controller
                control={control}
                name="iamRoleArn"
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4" data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="awsparameterstore-iamrolearn">
                      IAM Role ARN For Role Assumption
                    </FieldLabel>
                    <Input
                      placeholder=""
                      {...field}
                      id="awsparameterstore-iamrolearn"
                      isError={Boolean(error)}
                      aria-describedby={error ? "awsparameterstore-iamrolearn-error" : undefined}
                    />
                    {Boolean(error) && (
                      <FieldError id="awsparameterstore-iamrolearn-error">
                        {error?.message}
                      </FieldError>
                    )}
                  </Field>
                )}
              />
            )}
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" isPending={formState.isSubmitting} variant="project">
              Connect to AWS Parameter Store
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
