import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  Button,
  FieldError,
  TextArea,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useAddUsersToOrg } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { usePopUp } from "@app/hooks/usePopUp";

import { EmailServiceSetupModal } from "../v2";

/**
 * This is the last step of the signup flow. People can optionally invite their teammates here.
 */
export default function TeamInviteStep(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [emails, setEmails] = useState("");
  const [validationError, setValidationError] = useState("");
  const { data: serverDetails } = useFetchServerStatus();

  const { mutateAsync, isPending } = useAddUsersToOrg();
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
    const parsed = inviteEmails
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      setValidationError("Please enter at least one email address.");
      return;
    }

    const invalid = parsed.filter((email) => !z.string().email().safeParse(email).success);
    if (invalid.length > 0) {
      setValidationError(`Invalid email${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}`);
      return;
    }

    setValidationError("");

    await Promise.all(
      parsed.map((email) =>
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
      <UnstableCard className="mx-auto w-full max-w-md items-stretch gap-0 p-6">
        <UnstableCardHeader className="mb-4 gap-2">
          <UnstableCardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.65rem] font-medium text-transparent">
            {t("signup.step5-invite-team")}
          </UnstableCardTitle>
        </UnstableCardHeader>
        <UnstableCardContent className="flex flex-col gap-y-4">
          <div className="w-full">
            <TextArea
              className="min-h-20"
              value={emails}
              onChange={(e) => {
                setEmails(e.target.value);
                if (validationError) setValidationError("");
              }}
              placeholder="email1@example.com, email2@example.com"
            />
            {validationError && <FieldError>{validationError}</FieldError>}
          </div>
          <Button
            onClick={() => {
              if (serverDetails?.emailConfigured) {
                inviteUsers({ emails });
              } else {
                handlePopUpOpen("setUpEmail");
              }
            }}
            variant="project"
            size="lg"
            isFullWidth
            isPending={isPending}
          >
            {t("signup.step5-send-invites") ?? ""}
          </Button>

          <Button
            onClick={redirectToHome}
            isDisabled={isPending}
            variant="outline"
            size="lg"
            isFullWidth
          >
            {t("signup.step5-skip") ?? "Skip"}
          </Button>
        </UnstableCardContent>
      </UnstableCard>
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </div>
  );
}
