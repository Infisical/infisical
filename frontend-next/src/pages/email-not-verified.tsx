import React from "react";
import Head from "next/head";

export default function EmailNotFeriviedPage() {
  return (
    <div className="flex flex-col justify-between bg-bunker-800 md:h-screen">
      <Head>
        <title>Request a New Invite</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex h-screen w-screen flex-col items-center justify-center text-gray-200">
        <p className="text-6xl">Oops.</p>
        <p className="mt-2 mb-1 text-xl">Your email was not verified. </p>
        <p className="text-xl">Please try again.</p>
        <p className="text-md mt-8 max-w-sm text-center text-gray-600">
          Note: If it still doesn&apos;t work, please reach out to us at support@infisical.com
        </p>
      </div>
    </div>
  );
}
