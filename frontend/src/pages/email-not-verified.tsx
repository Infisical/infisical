import React from "react";
import Head from "next/head";

export default function EmailNotFeriviedPage() {
  return (
    <div className="bg-bunker-800 md:h-screen flex flex-col justify-between">
      <Head>
        <title>Request a New Invite</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-col items-center justify-center text-gray-200 h-screen w-screen">
        <p className="text-6xl">Oops.</p>
        <p className="mt-2 mb-1 text-xl">Your email was not verified. </p>
        <p className="text-xl">Please try again.</p>
        <p className="text-md mt-8 text-gray-600 max-w-sm text-center">
          Note: If it still doesn&apos;t work, please reach out to us at support@infisical.com
        </p>
      </div>
    </div>
  );
}
