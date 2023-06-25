import { useTranslation } from "react-i18next";
import Head from "next/head";
import Plan from "@app/components/billing/Plan";
import NavHeader from "@app/components/navigation/NavHeader";
import { useSubscription } from "@app/context";
import {
  Input,
  Button,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faMagnifyingGlass, faDownload } from "@fortawesome/free-solid-svg-icons";

import { Tab } from '@headlessui/react'
import { Fragment } from 'react'

import { 
    BillingCloudTab,
    BillingReceiptsTab,
    BillingDetailsTab
} from "./components";

export const BillingSettingsPage = () => {
    const { t } = useTranslation();
    return (
      <div className="h-full p-8">
        <NavHeader pageName={t("billing.title")} />
        
        <div className="flex text-3xl mt-8 items-start max-w-screen-lg">
          <div className="flex-1">
            <p className="font-semibold text-gray-200">{t("billing.title")}</p>
            {/* <p className="text-base font-normal text-gray-400">
              Manage usage and billing for Infisical Cloud and Self-hosted instances here
            </p> */}
          </div>
          <div>
          </div>
        </div>

        <Tab.Group>
            <Tab.List className="mt-8 border-b-2 border-mineshaft-800 max-w-screen-lg">
                <Tab as={Fragment}>
                    {({ selected }) => (
                        /* Use the `selected` state to conditionally style the selected tab. */
                        <button className={`p-4 ${selected ? "border-b-2 border-white text-white" : "text-mineshaft-400"} w-30 font-semibold outline-none`}>
                            Infisical Cloud
                        </button>
                    )}
                </Tab>
                {/* <Tab as={Fragment}>
                    {({ selected }) => (
                        <button className={`p-4 ${selected ? "border-b-2 border-white text-white" : "text-mineshaft-400"} w-30 font-semibold outline-none`}>
                            Self-hosted
                        </button>
                    )}
                </Tab> */}
                <Tab as={Fragment}>
                    {({ selected }) => (
                        /* Use the `selected` state to conditionally style the selected tab. */
                        <button className={`p-4 ${selected ? "border-b-2 border-white text-white" : "text-mineshaft-400"} w-30 font-semibold outline-none`}>
                            Receipts
                        </button>
                    )}
                </Tab>
                <Tab as={Fragment}>
                    {({ selected }) => (
                        /* Use the `selected` state to conditionally style the selected tab. */
                        <button className={`p-4 ${selected ? "border-b-2 border-white text-white" : "text-mineshaft-400"} w-30 font-semibold outline-none`}>
                            Billing details
                        </button>
                    )}
                </Tab>
            </Tab.List>
            <Tab.Panels>
                <Tab.Panel>
                    <BillingCloudTab />
                </Tab.Panel>
                {/* <Tab.Panel>Content 2</Tab.Panel> */}
                <Tab.Panel>
                    <BillingReceiptsTab />
                </Tab.Panel>
                <Tab.Panel>
                    <BillingDetailsTab />
                </Tab.Panel>
            </Tab.Panels>
        </Tab.Group>

        
        
        {/* <div className="flex w-max flex-col text-mineshaft-50 mt-8">
          <p className="text-xl font-semibold">{t("billing.subscription")}</p>
          <div className="mt-4 grid grid-cols-2 grid-rows-2 gap-y-6 gap-x-3 overflow-x-auto">
            {plans.map((plan) => (
              <Plan key={plan.name} plan={plan} />
            ))}
          </div>
          <p className="mt-12 text-xl font-bold">{t("billing.current-usage")}</p>
          <div className="flex flex-row">
            <div className="mr-4 mt-8 flex w-60 flex-col items-center justify-center rounded-md bg-white/5 pt-6 pb-10 text-gray-300">
              <p className="text-6xl font-bold">{numUsers}</p>
              <p className="text-gray-300">
                Organization members
              </p>
            </div>
            <div className="mr-4 mt-8 text-gray-300 w-60 pt-6 pb-10 rounded-md bg-white/5 flex justify-center items-center flex flex-col">
                <p className="text-6xl font-bold">1 </p>
                <p className="text-gray-300">Organization projects</p>
              </div>
          </div>
        </div> */}
      </div>
    );
};