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

  const orgId = String(localStorage.getItem("orgData.id"));

  // Redirect user to the getting started page
  const redirectToHome = async () => {
    navigate({
      to: orgId ? ("/organizations/$orgId/projects" as const) : "/",
      params: { orgId }
    });
  };

  const inviteUsers = async ({ emails: inviteEmails }: { emails: string }) => {
    inviteEmails
      .split(",")
      .map((email) => email.trim())
      .map(async (email) => {
        mutateAsync({
          inviteeEmails: [email],
          organizationId: orgId,
          organizationRoleSlug: "member"
        });
      });

    await redirectToHome();
  };

  return (
    <div className="mx-auto mb-64 h-full w-max min-w-lg px-8 pb-4 md:mb-32">
      <p className="flex justify-center bg-linear-to-b from-white to-bunker-200 bg-clip-text text-2xl font-medium text-transparent">
        {t("signup.step5-invite-team")}
      </p>
      <p className="mt-4 mb-6 flex justify-center text-center text-bunker-400 md:mx-8">
        {t("signup.step5-subtitle")}
      </p>
      <div className="mx-auto mb-6 w-max rounded-xl border border-mineshaft-500 bg-mineshaft-800 px-8 pt-6 pb-4 drop-shadow-xl">
        <div>
          <div className="pb-1 pl-1 text-sm font-medium text-bunker-300">
            <span>Emails</span>
          </div>
          <textarea
            className="ring-opacity-70 h-20 w-full min-w-120 rounded-md border border-mineshaft-500 bg-mineshaft-900/70 px-2 py-1 text-sm text-bunker-300 ring-primary-800 outline-hidden placeholder:text-bunker-400 focus:ring-2"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="email@example.com, email2@example.com..."
          />
        </div>
        <div className="mx-auto mt-2 flex w-full flex-row items-end justify-end text-sm md:mt-4 md:mb-2 md:max-w-md md:min-w-120">
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
      <div className="mx-auto mt-4 mb-2 flex max-h-24 max-w-max min-w-[20rem] flex-row items-center justify-center px-4 text-lg md:p-2">
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
