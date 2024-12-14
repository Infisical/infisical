import { useTranslation } from "react-i18next";
import Head from "next/head";

import { UserSecretsPage } from "@app/views/UserSecrets";

const UserSecrets = () => {
    const { t } = useTranslation();

    return (
        <>
            <Head>
                <title>{t("common.head-title", { title: t("user-secrets.title") })}</title>
                <link rel="icon" href="/infisical.ico" />
                <meta property="og:image" content="/images/message.png" />
                <meta property="og:title" content={String(t("user-secrets.og-title"))} />
                <meta name="og:description" content={String(t("user-secrets.og-description"))} />
            </Head>
            <div className="h-full">
                <UserSecretsPage />
            </div>
        </>
    )
}

export default UserSecrets;

UserSecrets.requireAuth = true;