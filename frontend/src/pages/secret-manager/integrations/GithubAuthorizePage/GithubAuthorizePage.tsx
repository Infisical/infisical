import crypto from "crypto";

import { useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  ProviderIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { localStorageService } from "@app/helpers/localStorage";
import { useGetCloudIntegrations } from "@app/hooks/api";

import { createIntegrationMissingEnvVarsNotification } from "../../IntegrationsListPage/IntegrationsListPage.utils";

enum AuthMethod {
  APP = "APP",
  OAUTH = "OAUTH"
}

export const GithubAuthorizePage = () => {
  const navigate = useNavigate();
  const { data: cloudIntegrations } = useGetCloudIntegrations();
  const githubIntegration = cloudIntegrations?.find((integration) => integration.slug === "github");
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<AuthMethod>(AuthMethod.APP);
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Select GitHub Integration Auth</title>
      </Helmet>
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="flex items-center pb-0.5">
                <ProviderIcon icon="GitHub.png" height={30} width={30} alt="GitHub logo" />
              </div>
              <span className="ml-2.5">GitHub Integration </span>
              <a
                href="https://infisical.com/docs/integrations/cicd/githubactions"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-warning/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-warning opacity-80 hover:opacity-100">
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
          <CardDescription>
            Select how you&apos;d like to integrate with GitHub. We recommend using the GitHub App
            method for fine-grained access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="mb-4" data-invalid={false}>
            <FieldLabel htmlFor="github-select-authentication-method">
              Select authentication method
            </FieldLabel>
            <Select
              value={selectedAuthMethod}
              onValueChange={(val) => {
                setSelectedAuthMethod(val as AuthMethod);
              }}
            >
              <SelectTrigger className="w-full" id="github-select-authentication-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AuthMethod.APP}>GitHub App (Recommended)</SelectItem>
                <SelectItem value={AuthMethod.OAUTH}>OAuth</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button
              onClick={() => {
                if (selectedAuthMethod === AuthMethod.APP) {
                  navigate({
                    to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/select-integration-auth",
                    params: {
                      orgId: currentOrg.id,
                      projectId: currentProject.id
                    },
                    search: {
                      integrationSlug: "github"
                    }
                  });
                } else {
                  if (!githubIntegration?.clientId) {
                    createIntegrationMissingEnvVarsNotification(
                      "githubactions",
                      "cicd",
                      "connecting-with-github-oauth"
                    );
                    return;
                  }

                  const state = crypto.randomBytes(16).toString("hex");
                  localStorage.setItem("latestCSRFToken", state);
                  localStorageService.setIntegrationProjectId(currentProject.id);
                  window.location.assign(
                    `https://github.com/login/oauth/authorize?client_id=${githubIntegration?.clientId}&response_type=code&scope=repo,admin:org&redirect_uri=${window.location.origin}/integrations/github/oauth2/callback&state=${state}`
                  );
                }
              }}
              className="mt-4 ml-auto w-min"
              variant="project"
            >
              Connect to GitHub
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
