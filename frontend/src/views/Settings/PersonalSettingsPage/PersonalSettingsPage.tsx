import { useTranslation } from "react-i18next";

import { PersonalTabGroup } from "./PersonalTabGroup";

export const PersonalSettingsPage = () => {
    const { t } = useTranslation();
    return (
        <div className="flex justify-center bg-bunker-800 text-white w-full px-6">
            <div className="max-w-6xl w-full">
                <div className="mt-6 mb-6">
                    <p className="text-3xl font-semibold text-gray-200">
                        {t("settings.personal.title")}
                    </p>
                </div>
                <PersonalTabGroup />
            </div>
        </div>
    );
}