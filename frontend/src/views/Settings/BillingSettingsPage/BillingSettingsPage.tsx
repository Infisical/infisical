import { useTranslation } from "react-i18next";

import {
  BillingTabGroup
} from "./components";

export const BillingSettingsPage = () => {
    const { t } = useTranslation();
    return (
      <div className="flex justify-center bg-bunker-800 text-white w-full h-full px-6">
        <div className="max-w-7xl w-full">
          <div className="my-6">
              <p className="text-3xl font-semibold text-gray-200">{t("billing.title")}</p>
            <div />
          </div>
          <BillingTabGroup />
        </div>
      </div>
    );
};