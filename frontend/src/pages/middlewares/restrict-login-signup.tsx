import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { createFileRoute, Outlet, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { addSeconds, formatISO } from "date-fns";
import DOMPurify from "dompurify";
import rehypeRaw from "rehype-raw";

import { Button } from "@app/components/v3";
import { SessionStorageKeys } from "@app/const";
import { useServerConfig } from "@app/context";
import { LoginSignupQueryParamsSchema, restrictLoginSignup } from "@app/helpers/authRouteGuards";
import { GtmHead } from "@app/hooks/useGtm";

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
      <GtmHead />
      {config.authConsentContent && !hasConsented && (
        <div className="bg-opacity-90 fixed inset-0 z-50 flex items-center justify-center bg-surface-hover/80">
          <div className="max-h-[80vh] w-4/12 overflow-y-auto rounded-lg bg-page p-6 text-foreground-inverse">
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>
              {DOMPurify.sanitize(config.authConsentContent)}
            </ReactMarkdown>
            <div className="mt-6 flex justify-end">
              <Button onClick={handleConsent} variant="outline">
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
  validateSearch: zodValidator(LoginSignupQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ callback_port: undefined, force: undefined })]
  },
  beforeLoad: ({ context, location, search }) => restrictLoginSignup({ context, location, search }),
  component: AuthConsentWrapper
});
