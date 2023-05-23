/* eslint-disable @typescript-eslint/no-unused-vars */
import Head from 'next/head';
import { useTranslation } from 'next-i18next';

import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';
import { OrgSettingsPage } from '@app/views/Settings/OrgSettingsPage';

export default function SettingsOrg() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t('common:head-title', { title: t('settings-org:title') })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <OrgSettingsPage />
    </>
  );
}

SettingsOrg.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps([
  'settings',
  'settings-org',
  'section-incident',
  'section-members'
]);
