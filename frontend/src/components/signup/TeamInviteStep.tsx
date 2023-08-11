import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";

import { useAddUserToOrg } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { usePopUp } from "@app/hooks/usePopUp";

import { Button, EmailServiceSetupModal } from "../v2";

/**
 * This is the last step of the signup flow. People can optionally invite their teammates here.
 */
export default function TeamInviteStep(): JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const [emails, setEmails] = useState("");
  const { data: serverDetails } = useFetchServerStatus();
  
  const { mutateAsync } = useAddUserToOrg();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["setUpEmail"] as const);

  // Redirect user to the getting started page
  const redirectToHome = async () => {
    router.push(`/org/${localStorage.getItem("orgData.id")}/overview`);
  };

  const inviteUsers = async ({ emails: inviteEmails }: { emails: string }) => {
    inviteEmails
      .split(",")
      .map((email) => email.trim())
      .map(async (email) => {
        mutateAsync({
          inviteeEmail: email,
          organizationId: String(localStorage.getItem("orgData.id"))
        });
      });

    await redirectToHome();
  };

  return (
    <div className="w-max mx-auto min-w-lg h-full pb-4 px-8 mb-64 md:mb-32">
      <p className="text-2xl font-semibold flex justify-center text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200">
        {t("signup.step5-invite-team")}
      </p>
      <p className="text-center flex justify-center text-bunker-400 md:mx-8 mb-6 mt-4">
        {t("signup.step5-subtitle")}
      </p>
      <div className="bg-mineshaft-800 border border-mineshaft-500 w-max mx-auto pt-6 pb-4 px-8 rounded-xl drop-shadow-xl mb-6">
        <div>
          <div className="text-bunker-300 font-medium pl-1 pb-1 text-sm">
            <span>Emails</span>
          </div>
          <textarea
            className="bg-mineshaft-900/70 min-w-[30rem] h-20 w-full placeholder:text-bunker-400 py-1 px-2 rounded-md border border-mineshaft-500 text-sm text-bunker-300 outline-none focus:ring-2 ring-primary-800 ring-opacity-70"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="email@example.com, email2@example.com..."
          />
        </div>
        <div className="flex flex-row items-end justify-end mt-0 md:mt-4 md:mb-2 w-full md:min-w-[30rem] mt-2 md:max-w-md mx-auto text-sm">
          <Button
            onClick={() => {
              if (serverDetails?.emailConfigured) {
                inviteUsers({ emails })
              } else {
                handlePopUpOpen("setUpEmail");
              }
            }}
            size="sm"
            // isFullWidth
            className='h-10'
            colorSchema="primary"
            variant="solid"
          > {t("signup.step5-send-invites") ?? ""} </Button>
        </div>
        <EmailServiceSetupModal
          isOpen={popUp.setUpEmail?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
        />
      </div>
      <div className="flex flex-row max-w-max min-w-28 items-center justify-center md:p-2 min-w-[20rem] max-h-24 mx-auto text-lg px-4 mt-4 mb-2">
        <Button
          onClick={redirectToHome}
          size="sm"
          isFullWidth
          className='h-12'
          colorSchema="secondary"
          variant="outline"
        > {t("signup.step5-skip") ?? "Skip"} </Button>
      </div>
    </div>
  );
}
