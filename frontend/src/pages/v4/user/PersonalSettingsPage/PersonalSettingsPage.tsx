import { useEffect } from "react";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Toaster } from "@app/components/v4/ui/sonner";
import { Tabs } from "@app/components/v4/ui/tabs";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";
import { AppInset, PageGutter } from "@app/components/v4/ui/top-bar";
import { analytics } from "@app/lib/analytics";

import { orgHref, v4Path } from "../../links";
import { resolveV4Href } from "../../resolveV4Href";
import { AuthenticationTab } from "./AuthenticationTab";
import { GeneralTab } from "./GeneralTab";

type Tab = "general" | "authentication" | "api-keys";

const tabs: { value: Tab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "authentication", label: "Authentication" },
  { value: "api-keys", label: "API keys" }
];

const ApiKeysTab = () => (
  <Alert tone="bad">
    <AlertTitle>API key authentication is no longer supported</AlertTitle>
    <AlertDescription>
      Existing keys no longer authenticate requests. Use{" "}
      <a
        href="https://infisical.com/docs/documentation/platform/identities/overview"
        target="_blank"
        rel="noreferrer"
      >
        machine identities
      </a>{" "}
      for programmatic access.
    </AlertDescription>
  </Alert>
);

export const PersonalSettingsPage = () => {
  const navigate = useNavigate();
  const search = useSearch({ from: "/v4/personal-settings" });
  const { v4Mode, organizationId } = useRouteContext({ from: "/v4/personal-settings" });
  const backHref = resolveV4Href(orgHref(organizationId ?? "", "/projects"), v4Mode);

  useEffect(() => {
    if (v4Mode !== "live") return undefined;
    analytics.registerUiVersion("v4");
    return () => analytics.unregisterUiVersion();
  }, [v4Mode]);

  return (
    <TooltipProvider>
      <PageTitle title="Personal settings" />
      <AppInset>
        <PageGutter>
          <Stack gap={24}>
            <div>
              <Button variant="link" underline="hover" asChild>
                <a
                  href={backHref}
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
                      return;
                    event.preventDefault();
                    navigate({ href: backHref });
                  }}
                >
                  <ArrowLeft size={14} aria-hidden />
                  Back to organization
                </a>
              </Button>
            </div>
            <PageHeader
              title="Personal settings"
              tabs={
                <Tabs
                  label="Personal settings sections"
                  value={search.selectedTab}
                  onValueChange={(next) =>
                    navigate({
                      to: v4Path("/personal-settings"),
                      search: { ...search, selectedTab: next as Tab }
                    })
                  }
                  tabs={tabs.map((tab) => ({ ...tab, content: null }))}
                />
              }
            />
            {search.selectedTab === "general" && <GeneralTab />}
            {search.selectedTab === "authentication" && <AuthenticationTab />}
            {search.selectedTab === "api-keys" && <ApiKeysTab />}
          </Stack>
        </PageGutter>
      </AppInset>
      <Toaster />
    </TooltipProvider>
  );
};
