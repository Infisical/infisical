import { useTranslation } from "react-i18next";

import NavHeader from "@app/components/navigation/NavHeader";

import {
  BillingTabGroup
} from "./components";

export const BillingSettingsPage = () => {
    const { t } = useTranslation();
    return (
      <div className="h-full p-8">
        <NavHeader pageName={t("billing.title")} />
        
        <div className="flex text-3xl mt-8 items-start max-w-screen-lg">
          <div className="flex-1">
            <p className="font-semibold text-gray-200">{t("billing.title")}</p>
          </div>
          <div />
        </div>
        <BillingTabGroup />
      </div>
    );
};