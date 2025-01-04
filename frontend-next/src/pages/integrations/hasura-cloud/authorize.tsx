import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

const schema = yup.object({
  accessToken: yup.string().trim().required("Hasura Cloud Access Token is required")
});

type FormData = yup.InferType<typeof schema>;

const APP_NAME = "Hasura Cloud";
export default function HasuraCloudAuthorizeIntegrationPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const { control, handleSubmit } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      accessToken: ""
    }
  });

  const onFormSubmit = async ({ accessToken }: FormData) => {
    try {
      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "hasura-cloud",
        accessToken
      });

      setIsLoading(false);
      router.push(`/integrations/hasura-cloud/create?integrationAuthId=${integrationAuth.id}`);
    } catch (err) {
      setIsLoading(false);
      console.error(err);
    }
  };
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize {APP_NAME} Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding your access token, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Hasura.svg"
                height={30}
                width={30}
                alt={`${APP_NAME} logo`}
              />
            </div>
            <span className="ml-2.5">{APP_NAME} Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/hasura-cloud" passHref>
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
        <form onSubmit={handleSubmit(onFormSubmit)} className="px-6 pb-8 text-right">
          <Controller
            control={control}
            name="accessToken"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label={`${APP_NAME} Access Token`}
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input {...field} placeholder="" />
              </FormControl>
            )}
          />
          <Button
            colorSchema="primary"
            variant="outline_bg"
            className="mt-2 w-min"
            size="sm"
            type="submit"
            isLoading={isLoading}
          >
            Connect to {APP_NAME}
          </Button>
        </form>
      </Card>
    </div>
  );
}

HasuraCloudAuthorizeIntegrationPage.requireAuth = true;
