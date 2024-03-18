import { useTranslation } from "react-i18next";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";

import { SignupSSO } from "@app/views/Signup";

export default function SignupSSOPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const token = router.query.token as string;

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28 ">
      <Head>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Head>
      <div className="mb-4 mt-20 flex justify-center">
        <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical Logo" />
      </div>
      <SignupSSO providerAuthToken={token} />
    </div>
  );
}
