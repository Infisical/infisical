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

import {
  useSaveIntegrationAccessToken
} from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

const schema = yup.object({
  accessToken: yup.string().trim().required("Fly.io Access Token is required")
});

type FormData = yup.InferType<typeof schema>;

export default function FlyioAuthorizeIntegrationPage() {
  const router = useRouter();

  const {
    control,
    handleSubmit
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      accessToken: ""
    }
  });

  const { mutateAsync } = useSaveIntegrationAccessToken();
  
  const [isLoading, setIsLoading] = useState(false);
  
  const onFormSubmit = async ({
    accessToken
  }: FormData) => {
    try {
      setIsLoading(true);
      
      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "flyio",
        accessToken
      });
      
      setIsLoading(false);
      router.push(`/integrations/flyio/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      setIsLoading(false);
      console.error(err);
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize Fly.io Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 mb-12">
        <CardTitle 
          className="text-left px-6 text-xl" 
          subTitle="After adding your access token, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Flyio.svg"
                height={30}
                width={30}
                alt="Fly.io logo"
              />
            </div>
            <span className="ml-2.5">Fly.io Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/flyio" passHref>
              <a target="_blank" rel="noopener noreferrer">
                <div className="ml-2 mb-1 rounded-md text-yellow text-sm inline-block bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] opacity-80 hover:opacity-100 cursor-default">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5"/> 
                    Docs
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-1.5 text-xxs mb-[0.07rem]"/> 
                </div>
              </a>
            </Link>
          </div>
        </CardTitle>
        <form
          onSubmit={handleSubmit(onFormSubmit)}
          className="px-6 text-right pb-8"
        >
          <Controller
            control={control}
            name="accessToken"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Fly.io Access Token"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input 
                  {...field}
                  placeholder="" 
                />
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
            Connect to Fly.io
          </Button>
        </form>
      </Card>
    </div>
  );
}

FlyioAuthorizeIntegrationPage.requireAuth = true;
