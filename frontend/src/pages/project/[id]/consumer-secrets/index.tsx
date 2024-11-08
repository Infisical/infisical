import { useTranslation } from 'react-i18next';
import Head from 'next/head';

import { ConsumerSecretsPage } from '@app/views/Project/ConsumerSecretsPage';

const ConsumerSecrets = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>{t('common.head-title', { title: 'Consumer Secrets' })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <ConsumerSecretsPage />
    </div>
  );
};

export default ConsumerSecrets;

ConsumerSecrets.requireAuth = true;
