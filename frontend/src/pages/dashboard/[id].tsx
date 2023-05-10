import { useTranslation } from 'react-i18next';
import Head from 'next/head';
import { useRouter } from 'next/router';

import { DashboardPage } from '@app/views/DashboardPage';
import { DashboardEnvOverview } from '@app/views/DashboardPage/DashboardEnvOverview';

const Dashboard = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const queryEnv = router.query.env as string;
  const isOverviewMode = !queryEnv;

  const onExploreEnv = (slug: string) => {
    router.push({
      pathname: router.pathname,
      query: { ...router.query, env: slug }
    });
  };

  return (
    <>
      <Head>
        <title>{t('common.head-title', { title: t('dashboard.title') })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={String(t('dashboard.og-title'))} />
        <meta name="og:description" content={String(t('dashboard.og-description'))} />
      </Head>
      <div className="h-full">
        {isOverviewMode ? (
          <DashboardEnvOverview onEnvChange={onExploreEnv} />
        ) : (
          <DashboardPage envFromTop={queryEnv} />
        )}
      </div>
    </>
  );
};

export default Dashboard;

Dashboard.requireAuth = true;
