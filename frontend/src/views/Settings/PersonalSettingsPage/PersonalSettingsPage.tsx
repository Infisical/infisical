import { useTranslation } from "react-i18next";

import NavHeader from "@app/components/navigation/NavHeader";

import { PersonalTabGroup } from "./PersonalTabGroup";

export const PersonalSettingsPage = () => {
    const { t } = useTranslation();
    return (
        <div className="flex justify-center bg-bunker-800 text-white w-full h-full px-6">
            <div className="max-w-screen-lg w-full">
                <NavHeader pageName={t("settings.personal.title")} isProjectRelated={false} />
                <div className="my-8">
                    <p className="text-3xl font-semibold text-gray-200">
                        {t("settings.personal.title")}
                    </p>
                </div>
                <PersonalTabGroup />
            </div>
        </div>
    );
}