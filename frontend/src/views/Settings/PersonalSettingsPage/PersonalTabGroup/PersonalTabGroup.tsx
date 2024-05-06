import { Fragment } from "react";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";

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
    <Tab.Group>
      <Tab.List className="mb-4 w-full border-b-2 border-mineshaft-800">
        {tabs.map((tab) => (
          <Tab as={Fragment} key={tab.key}>
            {({ selected }) => (
              <button
                type="button"
                className={`w-30 mx-2 mr-4 py-2 text-sm font-medium outline-none ${
                  selected ? "border-b border-white text-white" : "text-mineshaft-400"
                }`}
              >
                {tab.name}
              </button>
            )}
          </Tab>
        ))}
      </Tab.List>
      <Tab.Panels>
        <Tab.Panel>
          <PersonalGeneralTab />
        </Tab.Panel>
        <Tab.Panel>
          <PersonalAuthTab />
        </Tab.Panel>
        <Tab.Panel>
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
                    className="font-semibold text-primary-400" rel="noreferrer"
                  >
                    here
                  </a>
                  .
                  <br />
                  <a
                    href="https://infisical.com/docs/documentation/platform/identities/overview"
                    target="_blank"
                    className="font-semibold text-primary-400" rel="noreferrer"
                  >
                    Learn more about Machine Identities
                  </a>
                </p>
              </div>
            </div>
            <PersonalAPIKeyTab />
          </div>
        </Tab.Panel>
      </Tab.Panels>
    </Tab.Group>
  );
};
