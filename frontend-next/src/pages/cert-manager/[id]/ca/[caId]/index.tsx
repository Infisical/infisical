/* eslint-disable @typescript-eslint/no-unused-vars */
import Head from "next/head";

import { CaPage } from "@app/views/Project/CaPage";

export default function Ca() {
  return (
    <>
      <Head>
        <title>Certificate Authority</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <CaPage />
    </>
  );
}

Ca.requireAuth = true;
