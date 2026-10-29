import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CircleHelpIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

export const WindmillAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending: isLoading } = useSaveIntegrationAccessToken();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyErrorText, setApiKeyErrorText] = useState("");
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [apiUrlErrorText, setApiUrlErrorText] = useState("");

  const isLocalOrPrivateIpAddress = (url: string): boolean => {
    try {
      const validUrl = new URL(url);
      // Check for localhost
      if (validUrl.hostname === "localhost" || validUrl.hostname === "127.0.0.1") {
        return true;
      }

      // Check for 10.x.x.x
      if (validUrl.hostname.match(/^10\.\d+\.\d+\.\d+/)) {
        return true;
      }

      // Check for host.docker.internal
      if (validUrl.hostname === "host.docker.internal") {
        return true;
      }

      // Check for 192.168.x.x
      if (validUrl.hostname.match(/^192\.168\.\d+\.\d+/)) {
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return true;
    }
  };

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText("");
      setApiUrlErrorText("");
      if (apiKey.length === 0) {
        setApiKeyErrorText("API Key cannot be blank");
        return;
      }

      if (apiUrl) {
        if (!apiUrl.startsWith("http://") && !apiUrl.startsWith("https://")) {
          setApiUrlErrorText("API URL must start with http:// or https://");
          return;
        }
        if (isInfisicalCloud() && isLocalOrPrivateIpAddress(apiUrl)) {
          setApiUrlErrorText("Local IPs not allowed as URL");
          return;
        }
      }

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "windmill",
        accessToken: apiKey,
        url: apiUrl ?? undefined
      });

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/windmill/create",
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
      <PageTitle title="Authorize Windmill Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Windmill Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={apiKeyErrorText !== ""}>
            <FieldLabel htmlFor="WindmillAuthorizePage-field-1">Windmill Access Token</FieldLabel>
            <Input
              id="WindmillAuthorizePage-field-1"
              aria-describedby="WindmillAuthorizePage-field-1-feedback"
              isError={apiKeyErrorText !== ""}
              placeholder=""
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            {apiKeyErrorText !== "" && (
              <FieldError id="WindmillAuthorizePage-field-1-feedback">{apiKeyErrorText}</FieldError>
            )}
          </Field>
          <Field data-invalid={apiUrlErrorText !== ""}>
            <FieldLabel htmlFor="WindmillAuthorizePage-field-2">
              Windmill Instance URL
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Windmill Instance URL">
                    <CircleHelpIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  If you are using a custom domain, enter it here. Otherwise, leave it blank.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              id="WindmillAuthorizePage-field-2"
              aria-describedby="WindmillAuthorizePage-field-2-feedback"
              isError={apiUrlErrorText !== ""}
              value={apiUrl ?? ""}
              onChange={(e) =>
                setApiUrl(e.target.value.trim() === "" ? null : e.target.value.trim())
              }
              placeholder="https://xxxx.windmill.dev"
            />
            {apiUrlErrorText !== "" && (
              <FieldError id="WindmillAuthorizePage-field-2-feedback">{apiUrlErrorText}</FieldError>
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Connect to Windmill
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
