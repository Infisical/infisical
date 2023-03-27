/* eslint-disable @typescript-eslint/no-unused-vars */
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';
import { CreateServiceAccountPage } from '@app/views/Settings/CreateServiceAccountPage';

export default function ServiceAccountPage() {
  const router = useRouter();
  // const { orgId, serviceAccountId } = router.query;
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>Edit Service Account</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div />
      <CreateServiceAccountPage />
    </>
  );
}

ServiceAccountPage.requireAuth = true;

export const getServerSidePros = getTranslatedServerSideProps([
  'settings',
  'settings-org',
  'section-incident',
  'section-members'
]);