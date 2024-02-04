import { useTranslation } from "react-i18next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

import { Login } from "@app/views/Login";

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen max-h-screen overflow-y-auto flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6">
      <Head>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Head>
      <Link href="/">
        <div className="mb-4 mt-20 flex justify-center">
          <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
        </div>
      </Link>
      <Login />
      <div className="pb-28"/>
    </div>
  );
}
