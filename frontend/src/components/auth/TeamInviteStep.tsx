import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";

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
    const emailList = inviteEmails
      .split(/[,\n\r]+/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    await Promise.all(
      emailList.map((email) =>
        mutateAsync({
          inviteeEmails: [email],
          organizationId: orgId,
          organizationRoleSlug: "member"
        })
      )
    );

    await redirectToHome();
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <motion.div
        layoutId="signup-card"
        className="mx-auto flex w-full max-w-md flex-col items-stretch rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-6"
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <p className="flex justify-center bg-linear-to-b from-white to-bunker-200 bg-clip-text text-xl font-bold text-transparent">
          {t("signup.step5-invite-team")}
        </p>
        <p className="mt-2 mb-4 flex justify-center text-center text-sm text-bunker-400">
          Enter up to 50 email addresses, separated by commas or new lines
        </p>
        <div className="w-full">
          <textarea
            className="ring-opacity-70 h-20 w-full rounded-md border border-mineshaft-500 bg-mineshaft-900/70 px-2 py-1 text-sm text-bunker-300 ring-primary-800 outline-hidden placeholder:text-bunker-400 focus:ring-2"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="email1@example.com, email2@example.com"
          />
        </div>
        <div className="mt-4 w-full">
          <Button
            onClick={() => {
              if (serverDetails?.emailConfigured) {
                inviteUsers({ emails });
              } else {
                handlePopUpOpen("setUpEmail");
              }
            }}
            size="sm"
            isFullWidth
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
        <div className="mt-6 w-full">
          <Button
            onClick={redirectToHome}
            size="sm"
            isFullWidth
            className="h-12"
            colorSchema="secondary"
            variant="outline"
          >
            {t("signup.step5-skip") ?? "Skip"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
