import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";

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
