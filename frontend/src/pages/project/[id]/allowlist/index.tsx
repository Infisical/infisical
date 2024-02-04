import { useTranslation } from "react-i18next";
import Head from "next/head";

import { IPAllowlistPage } from "@app/views/Project/IPAllowListPage";

const ProjectAllowlist = () => {
    const { t } = useTranslation();
    return (
        <>
            <Head>
                <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
                <link rel="icon" href="/infisical.ico" />
            </Head>
            <IPAllowlistPage />
        </>
    );
}

export default ProjectAllowlist;

ProjectAllowlist.requireAuth = true;