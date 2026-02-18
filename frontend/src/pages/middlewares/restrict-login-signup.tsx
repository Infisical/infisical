import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { createFileRoute, Outlet, redirect, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { addSeconds, formatISO } from "date-fns";
import DOMPurify from "dompurify";
import rehypeRaw from "rehype-raw";
import { z } from "zod";

import { Button } from "@app/components/v2";
import { SessionStorageKeys } from "@app/const";
import { useServerConfig } from "@app/context";
import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";
import { setAuthToken } from "@app/hooks/api/reactQuery";

const QueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined),
  force: z.boolean().optional(),
  org_id: z.string().optional().catch(undefined),
  auth_method: z.enum(["saml", "oidc"]).optional().catch(undefined),
  org_slug: z.string().regex(/^[a-z0-9-]+$/).optional().catch(undefined)
});

export const AuthConsentWrapper = () => {
  const { config } = useServerConfig();
  const [hasConsented, setHasConsented] = useState(() => {
    const consentInfo = sessionStorage.getItem(SessionStorageKeys.AUTH_CONSENT);
    if (!consentInfo) {
      return false;
    }

    const { expiry, data } = JSON.parse(consentInfo);
    if (new Date() > new Date(expiry)) {
      sessionStorage.removeItem(SessionStorageKeys.AUTH_CONSENT);
      return false;
    }

    return data === "true";
  });

  const handleConsent = () => {
    sessionStorage.setItem(
      SessionStorageKeys.AUTH_CONSENT,
      JSON.stringify({
        expiry: formatISO(addSeconds(new Date(), 60)),
        data: "true"
      })
    );

    setHasConsented(true);
  };

  return (
    <>
      {config.authConsentContent && !hasConsented && (
        <div className="bg-opacity-90 fixed inset-0 z-50 flex items-center justify-center bg-mineshaft-700/80">
          <div className="max-h-[80vh] w-4/12 overflow-y-auto rounded-lg bg-bunker-800 p-6 text-white">
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>
              {DOMPurify.sanitize(config.authConsentContent)}
            </ReactMarkdown>
            <div className="mt-6 flex justify-end">
              <Button onClick={handleConsent} colorSchema="secondary">
                OK
              </Button>
            </div>
          </div>
        </div>
      )}
      <Outlet />
    </>
  );
};

export const Route = createFileRoute("/_restrict-login-signup")({
  validateSearch: zodValidator(QueryParamsSchema),
  search: {
    middlewares: [
      stripSearchParams({
        callback_port: undefined,
        force: undefined,
        auth_method: undefined,
        org_slug: undefined
      })
    ]
  },
  beforeLoad: async ({ context, location, search }) => {
    if (!context.serverConfig.initialized) {
      if (location.pathname.endsWith("/admin/signup")) return;
      throw redirect({ to: "/admin/signup" });
    }

    const data = await context.queryClient
      .fetchQuery({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      })
      .catch(() => {
        return null;
      });
    if (!data) return;

    setAuthToken(data.token);

    if (location.pathname === "/signupinvite") return;

    // Avoid redirect if on select-organization page with force=true
    if (location.pathname.endsWith("select-organization") && search?.force === true) return;

    // to do cli login
    if (search?.callback_port) {
      if (location.pathname.endsWith("select-organization") || location.pathname.endsWith("login"))
        return;
    }

    if (search.org_id) {
      if (location.pathname.endsWith("select-organization")) return;

      throw redirect({ to: "/login/select-organization", search: { org_id: search.org_id } });
    }

    if (!data.organizationId) {
      if (
        location.pathname.endsWith("select-organization") ||
        location.pathname.endsWith("verify-email")
      )
        return;
      throw redirect({ to: "/login/select-organization" });
    }
    const orgId = data.subOrganizationId || data.organizationId;
    throw redirect({
      to: "/organizations/$orgId/projects",
      params: { orgId }
    });
  },
  component: AuthConsentWrapper
});
