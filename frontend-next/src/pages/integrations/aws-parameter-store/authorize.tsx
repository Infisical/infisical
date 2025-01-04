import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useSaveIntegrationAccessToken } from "@app/hooks/api";

import {
  Button,
  Card,
  CardBody,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "../../../components/v2";

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

export default function AWSParameterStoreAuthorizeIntegrationPage() {
  const router = useRouter();
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
        workspaceId: localStorage.getItem("projectData.id"),
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

      router.push(
        `/integrations/aws-parameter-store/create?integrationAuthId=${integrationAuth.id}`
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize AWS Parameter Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding the details below, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center">
              <Image
                src="/images/integrations/Amazon Web Services.png"
                height={35}
                width={35}
                alt="AWS logo"
              />
            </div>
            <span className="ml-1.5">AWS Parameter Store Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/aws-parameter-store" passHref>
              <a target="_blank" rel="noopener noreferrer">
                <div className="ml-2 mb-1 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="ml-1.5 mb-[0.07rem] text-xxs"
                  />
                </div>
              </a>
            </Link>
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
              className="mb-6 mt-2 ml-auto mr-6 w-min"
              isLoading={formState.isSubmitting}
            >
              Connect to AWS Parameter Store
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

AWSParameterStoreAuthorizeIntegrationPage.requireAuth = true;
