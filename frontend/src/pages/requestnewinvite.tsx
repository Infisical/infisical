import Head from "next/head";
import Image from "next/image";

/**
 * This is the page that shows up when a user's invitation
 * to join a project/organization on Infisical has expired
 */
export default function RequestNewInvite() {
  return (
    <div className="bg-bunker-700 md:h-screen flex flex-col justify-between">
      <Head>
        <title>Request a New Invite</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-col items-center justify-center text-bunker-200 h-screen w-screen mt-8">
        <p className="text-4xl text-primary-100">Oops, your invite has expired.</p>
        <p className="text-lg my-4">Ask your admin for a new one.</p>
        <p className="text-sm text-bunker-400 max-w-xs px-7 text-center leading-tight">
          <span className="bg-primary-500/40 text-black px-1 rounded-md">Note:</span> If it still
          doesn&apos;t work, please reach out to us at support@infisical.com
        </p>
        <div className="">
          <Image src="/images/invitation-expired.svg" height={500} width={800} alt="invitation expired illustration" />
        </div>
      </div>
    </div>
  );
}
