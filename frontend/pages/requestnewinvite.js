import React from "react";
import Head from "next/head";
import Image from "next/image";

export default function RequestNewInvite() {
  return (
    <div className="bg-bunker-700 md:h-screen flex flex-col justify-between">
      <Head>
        <title>Request a New Invite</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-col items-center justify-center text-bunker-200 h-screen w-screen mt-24">
        <p className="text-4xl text-bunker-100">Oops, your invite has expired.</p>
        <p className="text-lg my-6">Ask the administrator for a new one.</p>
        <p className="text-md text-bunker-400 max-w-sm text-center">
          Note: If it still {"doesn't work"}, please reach out to us at
          support@infisical.com
        </p>
        <div
          className=""
        >
          <Image
            src="/images/invitation-expired.svg"
            height={500}
            width={800}
            alt="google logo"
          ></Image>
        </div>
      </div>
    </div>
  );
}
