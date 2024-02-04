/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { NonePage } from "@app/views/Org/NonePage";

export default function NoneOrganization() {
    const { t } = useTranslation();
    return (
        <>
            <Head>
                <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
                <link rel="icon" href="/infisical.ico" />
            </Head>
            <NonePage />
        </>
    );
}

NoneOrganization.requireAuth = true;