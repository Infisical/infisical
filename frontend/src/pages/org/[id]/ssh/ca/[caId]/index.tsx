/* eslint-disable @typescript-eslint/no-unused-vars */
import Head from "next/head";

import { SshCaPage } from "@app/views/Org/SshCaPage";

export default function SshCa() {
  return (
    <>
      <Head>
        <title>SSH Certificate Authority</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <SshCaPage />
    </>
  );
}

SshCa.requireAuth = true;
