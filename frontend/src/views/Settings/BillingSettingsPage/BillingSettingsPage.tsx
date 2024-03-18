import { useTranslation } from "react-i18next";

import { BillingTabGroup } from "./components";

export const BillingSettingsPage = () => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <div className="w-full max-w-7xl px-6">
        <div className="my-6">
          <p className="text-3xl font-semibold text-gray-200">{t("billing.title")}</p>
          <div />
        </div>
        <BillingTabGroup />
      </div>
    </div>
  );
};
