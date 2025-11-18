import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { Spinner } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useMcpServerOAuthCallback } from "@app/hooks/api/pam";

export const McpServerOauthCallbackPage = () => {
  const navigate = useNavigate();
  const { accountId, projectId } = useParams({
    from: ROUTE_PATHS.Pam.McpServerOauthCallbackPage.id
  });
  const { code } = useSearch({
    from: ROUTE_PATHS.Pam.McpServerOauthCallbackPage.id
  });
  const mcpServerCallback = useMcpServerOAuthCallback();

  useEffect(() => {
    mcpServerCallback.mutate(
      {
        accountId,
        code,
        projectId
      },
      {
        onSuccess: () => {
          navigate({
            to: "/projects/pam/$projectId/accounts",
            params: {
              projectId
            }
          });
        }
      }
    );
  }, []);

  return (
    <div className="flex max-h-screen flex-col justify-center overflow-y-auto">
      <Helmet>
        <title>MCP</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="mx-auto mt-20 w-fit rounded-lg border-2 border-mineshaft-500 bg-mineshaft-800 p-10 shadow-lg">
        <img
          src="/images/gradientLogo.svg"
          style={{
            height: "90px",
            width: "120px"
          }}
          alt="Infisical logo"
        />
        <div className="flex items-center gap-1 text-bunker-300">
          Completing OAuth flow and requesting access token.
          {mcpServerCallback.isPending && <Spinner size="xs" />}
        </div>
      </div>
      <div className="pb-28" />
    </div>
  );
};
