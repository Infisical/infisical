import { Alert, AlertDescription, AlertTitle } from "@infisical/cipher/ui/alert";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";

import { v4Path } from "../../links";
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

  return (
    <TooltipProvider>
      <PageTitle title="Personal settings" />
      <Stack gap={24}>
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
    </TooltipProvider>
  );
};
