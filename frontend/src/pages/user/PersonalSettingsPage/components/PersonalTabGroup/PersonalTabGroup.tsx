import { ExternalLinkIcon, KeyRoundIcon, SettingsIcon, ShieldCheckIcon } from "lucide-react";

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
  { name: "General", key: "general", icon: SettingsIcon },
  { name: "Authentication", key: "authentication", icon: ShieldCheckIcon },
  { name: "API keys", key: "api-keys", icon: KeyRoundIcon }
] satisfies { name: string; key: PersonalSettingsTab; icon: typeof SettingsIcon }[];

export const PersonalTabGroup = ({ selectedTab, onTabChange }: Props) => {
  return (
    <Tabs
      value={selectedTab}
      onValueChange={(value) => onTabChange(value as PersonalSettingsTab)}
      className="mt-8"
    >
      <TabsList
        variant="filled"
        aria-label="Personal settings sections"
        className="max-w-full justify-start overflow-x-auto"
      >
        {tabs.map(({ name, key, icon: Icon }) => (
          <TabsTrigger value={key} key={key}>
            <Icon />
            {name}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="general" className="mt-6">
        <PersonalGeneralTab />
      </TabsContent>
      <TabsContent value="authentication" className="mt-6">
        <PersonalAuthTab />
      </TabsContent>
      <TabsContent value="api-keys" className="mt-6">
        <Alert variant="warning">
          <KeyRoundIcon />
          <AlertTitle>API keys are deprecated</AlertTitle>
          <AlertDescription>
            Use machine identities for programmatic access. API keys will be removed according to
            the published{" "}
            <a
              href="https://infisical.com/blog/deprecating-api-keys"
              target="_blank"
              rel="noreferrer"
            >
              deprecation timeline <ExternalLinkIcon className="inline size-3" />
            </a>
            . See the{" "}
            <a
              href="https://infisical.com/docs/documentation/platform/identities/overview"
              target="_blank"
              rel="noreferrer"
            >
              machine identities documentation <ExternalLinkIcon className="inline size-3" />
            </a>
            .
          </AlertDescription>
        </Alert>
      </TabsContent>
    </Tabs>
  );
};
