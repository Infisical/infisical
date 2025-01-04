import { useTranslation } from "react-i18next";
import Head from "next/head";

import { AdminLayout } from "@app/layouts";
import { AdminDashboardPage } from "@app/views/admin/DashboardPage";

const AdminDashboard = () => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("admin.dashboard") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("admin.dashboard.og-title") ?? ""} />
        <meta name="og:description" content={t("admin.dashboard.og-description") ?? ""} />
      </Head>
      <div className="h-full">
        <AdminDashboardPage />
      </div>
    </>
  );
};

export default AdminDashboard;

AdminDashboard.requireAuth = true;

AdminDashboard.layout = AdminLayout;
