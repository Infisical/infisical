import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Toaster } from "@infisical/cipher/ui/sonner";
import { Outlet } from "@tanstack/react-router";
import { addSeconds, formatISO } from "date-fns";
import DOMPurify from "dompurify";
import rehypeRaw from "rehype-raw";

import { SessionStorageKeys } from "@app/const";
import { useServerConfig } from "@app/context";
import { GtmHead } from "@app/hooks/useGtm";

const readConsent = () => {
  const consentInfo = sessionStorage.getItem(SessionStorageKeys.AUTH_CONSENT);
  if (!consentInfo) return false;
  const { expiry, data } = JSON.parse(consentInfo);
  if (new Date() > new Date(expiry)) {
    sessionStorage.removeItem(SessionStorageKeys.AUTH_CONSENT);
    return false;
  }
  return data === "true";
};

export const AuthLayout = () => {
  const { config } = useServerConfig();
  const [hasConsented, setHasConsented] = useState(readConsent);

  const handleConsent = () => {
    sessionStorage.setItem(
      SessionStorageKeys.AUTH_CONSENT,
      JSON.stringify({ expiry: formatISO(addSeconds(new Date(), 60)), data: "true" })
    );
    setHasConsented(true);
  };

  return (
    <>
      <GtmHead />
      <Outlet />
      <Dialog open={Boolean(config.authConsentContent) && !hasConsented}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Before you continue</DialogTitle>
          </DialogHeader>
          <ReactMarkdown rehypePlugins={[rehypeRaw]}>
            {DOMPurify.sanitize(config.authConsentContent ?? "")}
          </ReactMarkdown>
          <DialogFooter>
            <Button variant="accent" onClick={handleConsent}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Toaster />
    </>
  );
};
