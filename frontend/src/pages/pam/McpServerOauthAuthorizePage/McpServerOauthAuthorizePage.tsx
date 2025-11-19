import { Helmet } from "react-helmet";
import { useParams } from "@tanstack/react-router";

import { Spinner } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useMcpServerOAuthAuthorize } from "@app/hooks/api/pam";

export const McpServerOauthAuthorizePage = () => {
  const { accountId } = useParams({
    from: ROUTE_PATHS.Pam.McpServerOauthAuthoizePage.id
  });
  const mcpServerAuthorize = useMcpServerOAuthAuthorize(accountId);

  return (
    <div className="flex max-h-screen flex-col justify-center overflow-y-auto">
      <Helmet>
        <title>MCP</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="mx-auto mt-20 flex w-1/4 flex-col items-center rounded-lg border-2 border-mineshaft-500 bg-mineshaft-800 p-10 shadow-lg">
        <img
          src="/images/gradientLogo.svg"
          style={{
            height: "90px",
            width: "120px"
          }}
          alt="Infisical logo"
        />
        <div className="flex items-center gap-1 text-bunker-300">
          Please wait—redirecting to the authentication page.
          {mcpServerAuthorize.isLoading && <Spinner size="xs" />}
        </div>
      </div>
      <div className="pb-28" />
    </div>
  );
};
