/* eslint-disable @typescript-eslint/no-unused-vars */
import Head from 'next/head';

import { CreateServiceAccountPage } from '@app/views/Settings/CreateServiceAccountPage';

export default function ServiceAccountPage() {
  return (
    <>
      <Head>
        <title>Edit Service Account</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <CreateServiceAccountPage />
    </>
  );
}

ServiceAccountPage.requireAuth = true;
