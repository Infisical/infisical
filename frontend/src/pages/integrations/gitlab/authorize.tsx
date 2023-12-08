import crypto from "crypto";

import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useGetCloudIntegrations } from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

const schema = yup.object({
  gitLabURL: yup.string()
});

type FormData = yup.InferType<typeof schema>;

export default function GitLabAuthorizeIntegrationPage() {
  const { control, handleSubmit } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      gitLabURL: ""
    }
  });

  const { data: cloudIntegrations } = useGetCloudIntegrations();

  const onFormSubmit = ({ gitLabURL }: FormData) => {
    if (!cloudIntegrations) return;
    const integrationOption = cloudIntegrations.find(
      (integration) => integration.slug === "gitlab"
    );

    if (!integrationOption) return;

    const baseURL =
      (gitLabURL as string).trim() === "" ? "https://gitlab.com" : (gitLabURL as string).trim();

    const csrfToken = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", csrfToken);

    const state = `${csrfToken}|${
      (gitLabURL as string).trim() === "" ? "" : (gitLabURL as string).trim()
    }`;
    const link = `${baseURL}/oauth/authorize?clientid=${integrationOption.clientId}&redirect_uri=${window.location.origin}/integrations/gitlab/oauth2/callback&response_type=code&state=${state}`;

    window.location.assign(link);
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize GitLab Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Authorize this integration to sync secrets from Infisical to GitLab. If no self-hosted GitLab URL is specified, then Infisical will connect you to GitLab Cloud."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center pb-0.5">
              <Image
                src="/images/integrations/Gitlab.png"
                height={28}
                width={28}
                alt="Gitlab logo"
              />
            </div>
            <span className="ml-2.5">GitLab Integration </span>
            <Link href="https://infisical.com/docs/integrations/cicd/gitlab" passHref>
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
            name="gitLabURL"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Self-hosted URL (optional)"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input {...field} placeholder="https://self-hosted-gitlab.com" />
              </FormControl>
            )}
          />
          <Button
            colorSchema="primary"
            variant="outline_bg"
            className="mt-2 w-min"
            size="sm"
            type="submit"
          >
            Continue with OAuth
          </Button>
        </form>
      </Card>
    </div>
  );
}

GitLabAuthorizeIntegrationPage.requireAuth = true;
