import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";

import { SsoTabGroup } from "./components/SsoTabGroup";

export const SsoPage = () => {
  return (
    <>
      <Helmet>
        <title>Single Sign-On (SSO)</title>
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <PageHeader title="Single Sign-On (SSO)" />
          <SsoTabGroup />
        </div>
      </div>
    </>
  );
};
