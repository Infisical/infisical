import crypto from "crypto";

import { useState } from "react";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

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
      <PageTitle title="Select GitHub Integration Auth" />
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <ProviderIcon icon="GitHub.png" height={30} width={30} alt="GitHub logo" />
            <span>GitHub Integration</span>
          </CardTitle>
          <CardDescription>
            Select how you&apos;d like to integrate with GitHub. We recommend using the GitHub App
            method for fine-grained access.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cicd/githubactions"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
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
        </CardContent>
        <CardFooter className="justify-end">
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
            variant="project"
          >
            Connect to GitHub
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
