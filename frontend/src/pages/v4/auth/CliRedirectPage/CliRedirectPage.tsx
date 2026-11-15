import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Toaster, toast } from "@infisical/cipher/ui/sonner";
import { Link, useSearch } from "@tanstack/react-router";

import { orgHref } from "../../links";
import { canPreviewV4States } from "../../mode";
import { resolveV4Href } from "../../resolveV4Href";
import { AuthPage } from "../components/AuthPage";
import { clearCliToken, readCliToken } from "./cli-token";

const PREVIEW_TOKEN = "preview-cli-token-".repeat(12);

export const CliRedirectPage = () => {
  const { org_id: orgId, preview } = useSearch({ from: "/v4/cli-redirect" });
  const isPreview = Boolean(preview) && canPreviewV4States();
  const [cliToken, setCliToken] = useState(() => {
    if (isPreview) return preview === "token" ? PREVIEW_TOKEN : undefined;
    return readCliToken();
  });

  const handleCopy = async () => {
    if (!cliToken) return;
    try {
      await navigator.clipboard.writeText(cliToken);
    } catch {
      toast.error("Failed to copy the token. Select it and copy it manually.");
      return;
    }
    toast.success("Token copied");
    if (!isPreview) clearCliToken();
    setCliToken(undefined);
  };

  if (cliToken) {
    return (
      <>
        <AuthPage
          variant="focused"
          pageTitle="CLI Login Successful"
          title="Unable to reach the CLI"
          description="You're logged in, but Infisical couldn't send your login token to the CLI. Copy the token and paste it into your terminal."
        >
          <Stack gap={16}>
            <SecretInput
              aria-label="CLI login token"
              readOnly
              value={cliToken}
              onChange={() => undefined}
            />
            <Button variant="accent" size="lg" icon="copy" className="w-full" onClick={handleCopy}>
              Copy token
            </Button>
          </Stack>
        </AuthPage>
        <Toaster />
      </>
    );
  }

  return (
    <>
      <AuthPage
        variant="focused"
        pageTitle="CLI Login Successful"
        title="Head back to your terminal"
        description="You're logged in to the Infisical CLI."
      >
        {orgId && (
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link to={resolveV4Href(orgHref(orgId, "/projects"), "live") as never}>
              Open Infisical dashboard
            </Link>
          </Button>
        )}
      </AuthPage>
      <Toaster />
    </>
  );
};
