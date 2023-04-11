import Head from 'next/head';
import { useTranslation } from 'next-i18next';

import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';
import { DashboardPage } from '@app/views/DashboardPage';

const Dashboard = () => {
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t('common:head-title', { title: t('dashboard:title') })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={String(t('dashboard:og-title'))} />
        <meta name="og:description" content={String(t('dashboard:og-description'))} />
      </Head>
      <DashboardPage />
    </>
  );
};

Dashboard.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['dashboard']);

export default Dashboard;
