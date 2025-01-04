import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

const schema = z.object({
  authToken: z.string().trim().min(1, { message: "Rundeck Auth Token is required" }),
  rundeckURL: z.string().trim().min(1, {
    message: "Rundeck URL is required"
  })
});

type FormData = z.infer<typeof schema>;

export default function RundeckAuthorizeIntegrationPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      authToken: "",
      rundeckURL: ""
    }
  });

  const onFormSubmit = async ({ authToken, rundeckURL }: FormData) => {
    try {
      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "rundeck",
        accessToken: authToken,
        url: rundeckURL.trim()
      });

      setIsLoading(false);
      router.push(`/integrations/rundeck/create?integrationAuthId=${integrationAuth.id}`);
    } catch (err) {
      setIsLoading(false);
      console.error(err);
    }
  };
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize Rundeck Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="After adding your URL and auth token, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <Image
                src="/images/integrations/Rundeck.svg"
                height={30}
                width={30}
                alt="Rundeck logo"
              />
            </div>
            <span className="ml-2.5">Rundeck Integration </span>
            <Link href="https://infisical.com/docs/integrations/cicd/rundeck" passHref>
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
            name="rundeckURL"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="URL" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} placeholder="https://self-hosted-rundeck.com" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="authToken"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Rundeck Auth Token"
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
            Connect to Rundeck
          </Button>
        </form>
      </Card>
    </div>
  );
}

RundeckAuthorizeIntegrationPage.requireAuth = true;
