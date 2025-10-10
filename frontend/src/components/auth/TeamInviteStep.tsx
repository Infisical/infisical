import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { useAddUsersToOrg } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { usePopUp } from "@app/hooks/usePopUp";

import { Button, EmailServiceSetupModal } from "../v2";

/**
 * This is the last step of the signup flow. People can optionally invite their teammates here.
 */
export default function TeamInviteStep(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [emails, setEmails] = useState("");
  const { data: serverDetails } = useFetchServerStatus();

  const { mutateAsync } = useAddUsersToOrg();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["setUpEmail"] as const);

  // Redirect user to the getting started page
  const redirectToHome = async () => {
    navigate({ to: "/organization/projects" as const });
  };

  const inviteUsers = async ({ emails: inviteEmails }: { emails: string }) => {
    inviteEmails
      .split(",")
      .map((email) => email.trim())
      .map(async (email) => {
        mutateAsync({
          inviteeEmails: [email],
          organizationId: String(localStorage.getItem("orgData.id")),
          organizationRoleSlug: "member"
        });
      });

    await redirectToHome();
  };

  return (
    <div className="min-w-lg mx-auto mb-64 h-full w-max px-8 pb-4 md:mb-32">
      <p className="bg-linear-to-b to-bunker-200 flex justify-center from-white bg-clip-text text-2xl font-medium text-transparent">
        {t("signup.step5-invite-team")}
      </p>
      <p className="text-bunker-400 mb-6 mt-4 flex justify-center text-center md:mx-8">
        {t("signup.step5-subtitle")}
      </p>
      <div className="border-mineshaft-500 bg-mineshaft-800 mx-auto mb-6 w-max rounded-xl border px-8 pb-4 pt-6 drop-shadow-xl">
        <div>
          <div className="text-bunker-300 pb-1 pl-1 text-sm font-medium">
            <span>Emails</span>
          </div>
          <textarea
            className="min-w-120 border-mineshaft-500 bg-mineshaft-900/70 text-bunker-300 ring-primary-800 outline-hidden placeholder:text-bunker-400 h-20 w-full rounded-md border px-2 py-1 text-sm ring-opacity-70 focus:ring-2"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="email@example.com, email2@example.com..."
          />
        </div>
        <div className="md:min-w-120 mx-auto mt-2 flex w-full flex-row items-end justify-end text-sm md:mb-2 md:mt-4 md:max-w-md">
          <Button
            onClick={() => {
              if (serverDetails?.emailConfigured) {
                inviteUsers({ emails });
              } else {
                handlePopUpOpen("setUpEmail");
              }
            }}
            size="sm"
            // isFullWidth
            className="h-10"
            colorSchema="primary"
            variant="solid"
          >
            {" "}
            {t("signup.step5-send-invites") ?? ""}{" "}
          </Button>
        </div>
        <EmailServiceSetupModal
          isOpen={popUp.setUpEmail?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
        />
      </div>
      <div className="mx-auto mb-2 mt-4 flex max-h-24 min-w-[20rem] max-w-max flex-row items-center justify-center px-4 text-lg md:p-2">
        <Button
          onClick={redirectToHome}
          size="sm"
          isFullWidth
          className="h-12"
          colorSchema="secondary"
          variant="outline"
        >
          {" "}
          {t("signup.step5-skip") ?? "Skip"}{" "}
        </Button>
      </div>
    </div>
  );
}
