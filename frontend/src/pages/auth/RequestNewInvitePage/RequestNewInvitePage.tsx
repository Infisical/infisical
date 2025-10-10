import { Helmet } from "react-helmet";

/**
 * This is the page that shows up when a user's invitation
 * to join a project/organization on Infisical has expired
 */
export const RequestNewInvitePage = () => {
  return (
    <div className="bg-bunker-700 flex flex-col justify-between md:h-screen">
      <Helmet>
        <title>Request a New Invite</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="text-bunker-200 mt-8 flex h-screen w-screen flex-col items-center justify-center">
        <p className="text-primary-100 text-4xl">Oops, your invite has expired.</p>
        <p className="my-4 text-lg">Ask your admin for a new one.</p>
        <p className="text-bunker-400 max-w-xs px-7 text-center text-sm leading-tight">
          <span className="bg-primary-500/40 rounded-md px-1 text-black">Note:</span> If it still
          doesn&apos;t work, please reach out to us at support@infisical.com
        </p>
      </div>
    </div>
  );
};
