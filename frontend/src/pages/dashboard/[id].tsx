import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import queryString from 'query-string';

import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';
import { DashboardPage } from  '@app/views/DashboardPage';
import { DashboardEnvOverview } from '@app/views/DashboardPage/DashboardEnvOverview';

const Dashboard = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const env = queryString.parse(router.asPath.split('?')[1])?.env;

  return (
    <>
      <Head>
        <title>{t('common:head-title', { title: t('dashboard:title') })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={String(t('dashboard:og-title'))} />
        <meta name="og:description" content={String(t('dashboard:og-description'))} />
      </Head>
      {env 
      ? <DashboardPage envFromTop={String(env)}/>
      : <DashboardEnvOverview />}
    </>
  );
};

Dashboard.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['dashboard']);

export default Dashboard;
