import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";

import { PersonalAPIKeyTab } from "../PersonalAPIKeyTab";
import { PersonalAuthTab } from "../PersonalAuthTab";
import { PersonalGeneralTab } from "../PersonalGeneralTab";

const tabs = [
  { name: "General", key: "tab-account-general" },
  { name: "Authentication", key: "tab-account-auth" },
  { name: "API Keys", key: "tab-account-api-keys" }
];

export const PersonalTabGroup = () => {
  return (
    <Tabs defaultValue={tabs[0].key}>
      <TabList>
        {tabs.map((tab) => (
          <Tab value={tab.key}>{tab.name}</Tab>
        ))}
      </TabList>
      <TabPanel value={tabs[0].key}>
        <PersonalGeneralTab />
      </TabPanel>
      <TabPanel value={tabs[1].key}>
        <PersonalAuthTab />
      </TabPanel>
      <TabPanel value={tabs[2].key}>
        <div className="space-y-3">
          <div className="mt-4 flex w-full flex-row items-center rounded-md border border-primary-600/70 bg-primary/[.07] p-4 text-base text-white">
            <FontAwesomeIcon icon={faWarning} className="pr-6 text-4xl text-white/80" />
            <div className="flex w-full flex-col text-sm">
              <span className="mb-4 text-lg font-semibold">Deprecation Notice</span>
              <p>
                API Keys are being deprecated in favor of Machine Identities.
                <br />
                They will be removed in the future in accordance with the deprecation notice and
                timeline stated{" "}
                <a
                  href="https://infisical.com/blog/deprecating-api-keys"
                  target="_blank"
                  className="font-semibold text-primary-400"
                  rel="noreferrer"
                >
                  here
                </a>
                .
                <br />
                <a
                  href="https://infisical.com/docs/documentation/platform/identities/overview"
                  target="_blank"
                  className="font-semibold text-primary-400"
                  rel="noreferrer"
                >
                  Learn more about Machine Identities
                </a>
              </p>
            </div>
          </div>
          <PersonalAPIKeyTab />
        </div>
      </TabPanel>
    </Tabs>
  );
};
