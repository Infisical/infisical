import { useTranslation } from "react-i18next";

import NavHeader from "@app/components/navigation/NavHeader";

import {
  BillingTabGroup
} from "./components";

export const BillingSettingsPage = () => {
    const { t } = useTranslation();
    return (
      <div className="flex justify-center bg-bunker-800 text-white w-full h-full px-6">
        <div className="max-w-screen-lg w-full">
          <NavHeader pageName={t("billing.title")} />
          <div className="my-8">
              <p className="text-3xl font-semibold text-gray-200">{t("billing.title")}</p>
            <div />
          </div>
          <BillingTabGroup />
        </div>
      </div>
    );
};