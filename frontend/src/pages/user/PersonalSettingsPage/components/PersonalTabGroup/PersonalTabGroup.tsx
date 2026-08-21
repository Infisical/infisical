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
  { name: "API keys", key: "api-keys", icon: TriangleAlertIcon }
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
            {Icon && <Icon aria-hidden className="text-warning" />}
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
        <Alert variant="warning">
          <KeyRoundIcon />
          <AlertTitle>API keys are deprecated</AlertTitle>
          <AlertDescription>
            <p>
              Use machine identities for programmatic access. API keys will be removed in a future
              release. See the{" "}
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
