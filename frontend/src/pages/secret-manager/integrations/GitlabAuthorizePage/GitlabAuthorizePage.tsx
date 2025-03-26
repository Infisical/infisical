import crypto from "crypto";

import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, Card, CardTitle, FormControl, Input } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { localStorageService } from "@app/helpers/localStorage";
import { useGetCloudIntegrations } from "@app/hooks/api";

import { createIntegrationMissingEnvVarsNotification } from "../../IntegrationsListPage/IntegrationsListPage.utils";

const schema = z.object({
  gitLabURL: z.string()
});

type FormData = z.infer<typeof schema>;

export const GitlabAuthorizePage = () => {
  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      gitLabURL: ""
    }
  });

  const { data: cloudIntegrations } = useGetCloudIntegrations();
  const { currentWorkspace } = useWorkspace();

  const onFormSubmit = ({ gitLabURL }: FormData) => {
    if (!cloudIntegrations) return;
    const integrationOption = cloudIntegrations.find(
      (integration) => integration.slug === "gitlab"
    );

    if (!integrationOption) return;

    if (!integrationOption.clientId) {
      createIntegrationMissingEnvVarsNotification(integrationOption.slug, "cicd");
      return;
    }

    const baseURL =
      (gitLabURL as string).trim() === "" ? "https://gitlab.com" : (gitLabURL as string).trim();

    const csrfToken = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", csrfToken);
    localStorageService.setIntegrationProjectId(currentWorkspace.id);

    const state = `${csrfToken}|${
      (gitLabURL as string).trim() === "" ? "" : (gitLabURL as string).trim()
    }`;
    localStorageService.setIntegrationProjectId(currentWorkspace.id);
    const link = `${baseURL}/oauth/authorize?client_id=${integrationOption.clientId}&redirect_uri=${window.location.origin}/integrations/gitlab/oauth2/callback&response_type=code&state=${state}`;

    window.location.assign(link);
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Authorize GitLab Integration</title>
      </Helmet>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Authorize this integration to sync secrets from Infisical to GitLab. If no self-hosted GitLab URL is specified, then Infisical will connect you to GitLab Cloud."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img src="/images/integrations/GitLab.png" height={28} width={28} alt="Gitlab logo" />
            </div>
            <span className="ml-2.5">GitLab Integration </span>
            <a
              href="https://infisical.com/docs/integrations/cicd/gitlab"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.07rem] ml-1.5 text-xxs"
                />
              </div>
            </a>
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
};
