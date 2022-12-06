import React, { useEffect, useState } from "react";
import Head from "next/head";
import useTranslation from "next-translate/useTranslation";

import Plan from "~/components/billing/Plan";
import NavHeader from "~/components/navigation/NavHeader";
import { STRIPE_PRODUCT_PRO, STRIPE_PRODUCT_STARTER } from "~/utilities/config";

import getOrganizationSubscriptions from "../../api/organization/GetOrgSubscription";
import getOrganizationUsers from "../../api/organization/GetOrgUsers";

export default function SettingsBilling() {
  let [currentPlan, setCurrentPlan] = useState("");
  let [numUsers, setNumUsers] = useState("");

  const { t } = useTranslation();

  const plans = [
    {
      key: 1,
      name: t("billing:starter.name"),
      price: t("billing:free"),
      priceExplanation: t("billing:starter.price-explanation"),
      text: t("billing:starter.text"),
      subtext: t("billing:starter.subtext"),
      buttonTextMain: t("billing:downgrade"),
      buttonTextSecondary: t("billing:learn-more"),
      current: currentPlan == STRIPE_PRODUCT_STARTER,
    },
    {
      key: 2,
      name: t("billing:professional.name"),
      price: "$9",
      priceExplanation: t("billing:professional.price-explanation"),
      subtext: t("billing:professional.subtext"),
      text: t("billing:professional.text"),
      buttonTextMain: t("billing:upgrade"),
      buttonTextSecondary: t("billing:learn-more"),
      current: currentPlan == STRIPE_PRODUCT_PRO,
    },
    {
      key: 3,
      name: t("billing:enterprise.name"),
      price: t("billing:custom-pricing"),
      text: t("billing:enterprise.text"),
      buttonTextMain: t("billing:schedule-demo"),
      buttonTextSecondary: t("billing:learn-more"),
      current: false,
    },
  ];

  useEffect(async () => {
    const subscriptions = await getOrganizationSubscriptions({
      orgId: localStorage.getItem("orgData.id"),
    });

    setCurrentPlan(subscriptions.data[0].plan.id);
    const orgUsers = await getOrganizationUsers({
      orgId: localStorage.getItem("orgData.id"),
    });
    setNumUsers(orgUsers.length);
  }, []);

  return (
    <div className="bg-bunker-800 max-h-screen flex flex-col justify-between text-white">
      <Head>
        <title>{t("common:head-title", { title: t("billing:title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-row">
        <div className="w-full max-h-screen pb-2 overflow-y-auto">
          <NavHeader pageName={t("billing:title")} />
          <div className="flex flex-row justify-between items-center ml-6 my-8 text-xl max-w-5xl">
            <div className="flex flex-col justify-start items-start text-3xl">
              <p className="font-semibold mr-4 text-gray-200">
                {t("billing:title")}
              </p>
              <p className="font-normal mr-4 text-gray-400 text-base">
                {t("billing:description")}
              </p>
            </div>
          </div>
          <div className="flex flex-col ml-6 text-mineshaft-50">
            <p className="text-xl font-semibold">{t("billing:subscription")}</p>
            <div className="flex flex-row mt-4 overflow-x-auto">
              {plans.map((plan) => (
                <Plan key={plan.name} plan={plan} />
              ))}
            </div>
            <p className="text-xl font-bold mt-12">
              {t("billing:current-usage")}
            </p>
            <div className="flex flex-row">
              <div className="mr-4 mt-8 text-gray-300 w-60 pt-6 pb-10 rounded-md bg-white/5 flex justify-center items-center flex flex-col">
                <p className="text-6xl font-bold">{numUsers}</p>
                <p className="text-gray-300">
                  {numUsers > 1
                    ? "Organization members"
                    : "Organization member"}
                </p>
              </div>
              {/* <div className="mr-4 mt-8 text-gray-300 w-60 pt-6 pb-10 rounded-md bg-white/5 flex justify-center items-center flex flex-col">
									<p className="text-6xl font-bold">1 </p>
									<p className="text-gray-300">Organization projects</p>
								</div> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

SettingsBilling.requireAuth = true;
