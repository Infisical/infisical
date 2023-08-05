import { useTranslation } from "react-i18next";
import Head from "next/head";

import { LogsPage } from "@app/views/Project/LogsPage";

const Logs = () => {
    const { t } = useTranslation();

    return (
        <div className="h-full bg-bunker-800">
        <Head>
            <title>{t("common.head-title", { title: t("billing.title") })}</title>
            <link rel="icon" href="/infisical.ico" />
            <meta property="og:image" content="/images/message.png" />
        </Head>
        <LogsPage />
    </div>
    );
}

export default Logs;

Logs.requireAuth = true;