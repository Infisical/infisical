import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  Button,
  Card,
  CardBody,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
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

export const AWSSecretManagerAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
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
        integration: "aws-secret-manager",
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
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/aws-secret-manager/create",
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
      <Helmet>
        <title>Authorize AWS Secrets Manager Integration</title>
      </Helmet>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding the details below, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <img
                src="/images/integrations/Amazon Web Services.png"
                height={35}
                width={35}
                alt="AWS logo"
              />
            </div>
            <span className="ml-1.5">AWS Secrets Manager Integration </span>
            <a
              href="https://infisical.com/docs/integrations/cloud/aws-secret-manager"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="text-xxs mb-[0.07rem] ml-1.5"
                />
              </div>
            </a>
          </div>
        </CardTitle>
        <CardBody>
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <Controller
              control={control}
              name="type"
              defaultValue={AwsAuthType.AccessKey}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Authentication Mode"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    <SelectItem value={AwsAuthType.AccessKey}>Access Key</SelectItem>
                    <SelectItem value={AwsAuthType.AssumeRole}>AWS Assume Role</SelectItem>
                  </Select>
                </FormControl>
              )}
            />
            {formAwsAuthTypeField === AwsAuthType.AccessKey ? (
              <>
                <Controller
                  control={control}
                  name="accessKey"
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
                  name="accessSecretKey"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Secret Access Key"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder=""
                        {...field}
                      />
                    </FormControl>
                  )}
                />
              </>
            ) : (
              <Controller
                control={control}
                name="iamRoleArn"
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
            )}
            <Button
              type="submit"
              colorSchema="primary"
              variant="outline_bg"
              className="mt-2 mr-6 mb-6 ml-auto w-min"
              isLoading={formState.isSubmitting}
            >
              Connect to AWS Secrets Manager
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
};
