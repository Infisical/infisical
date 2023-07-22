import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";

import ListBox from "@app/components/basic/Listbox";

export const ChangeLanguageSection = () => {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const lang = router.locale ?? "en";

    const setLanguage = async (to: string) => {
        router.push(router.asPath, router.asPath, { locale: to });
        localStorage.setItem("lang", to);
        i18n.changeLanguage(to);
    };

    return (
        <div className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600">
            <p className="text-xl font-semibold text-mineshaft-100 mb-8">
                {t("settings.personal.change-language")}
            </p>
            <div className="w-28">
                <ListBox
                    isSelected={lang}
                    onChange={setLanguage}
                    data={["en", "ko", "fr", "es"]}
                    text={`${t("common.language")}: `}
                />
            </div>
        </div>
    );
}