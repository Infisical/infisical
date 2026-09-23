import { ExternalLinkIcon, KeyRoundIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";

import { PersonalAuthTab } from "../PersonalAuthTab";
import { PersonalGeneralTab } from "../PersonalGeneralTab";

type PersonalSettingsTab = "general" | "authentication" | "api-keys";

type Props = {
  selectedTab: PersonalSettingsTab;
  onTabChange: (tab: PersonalSettingsTab) => void;
};

const tabs = [
  { name: "General", key: "general" },
  { name: "Authentication", key: "authentication" },
  { name: "API Keys", key: "api-keys", icon: TriangleAlertIcon }
] satisfies { name: string; key: PersonalSettingsTab; icon?: typeof TriangleAlertIcon }[];

export const PersonalTabGroup = ({ selectedTab, onTabChange }: Props) => {
  return (
    <Tabs
      value={selectedTab}
      onValueChange={(value) => onTabChange(value as PersonalSettingsTab)}
      className="mt-8"
    >
      <TabsList variant="filled" aria-label="Personal settings sections">
        {tabs.map(({ name, key, icon: Icon }) => (
          <TabsTrigger value={key} key={key}>
            {Icon && <Icon aria-hidden className="text-danger" />}
            {name}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="general">
        <PersonalGeneralTab />
      </TabsContent>
      <TabsContent value="authentication">
        <PersonalAuthTab />
      </TabsContent>
      <TabsContent value="api-keys">
        <Alert variant="danger">
          <KeyRoundIcon />
          <AlertTitle>API key authentication is no longer supported</AlertTitle>
          <AlertDescription>
            <p>
              Existing keys no longer authenticate requests. Use machine identities for programmatic
              access. See the{" "}
              <a
                href="https://infisical.com/docs/documentation/platform/identities/overview"
                target="_blank"
                rel="noreferrer"
              >
                machine identities documentation <ExternalLinkIcon className="inline size-3" />
              </a>
              .
            </p>
          </AlertDescription>
        </Alert>
      </TabsContent>
    </Tabs>
  );
};
