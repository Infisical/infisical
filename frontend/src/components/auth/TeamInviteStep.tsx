import { useState } from "react";
import { useTranslation } from "react-i18next";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldFeedback,
  TextArea
} from "@app/components/v3";
import { emailListSchema, parseEmailList } from "@app/helpers/email";
import { useAddUsersToOrg } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { usePopUp } from "@app/hooks/usePopUp";
import { waitForMinimumDuration } from "@app/lib/fn/promise";

import { AuthPagePanel } from "./AuthPagePanel";
import { EmailServiceSetupModal } from "./EmailServiceSetupModal";

interface TeamInviteStepProps {
  emails: string;
  onEmailsChange: (emails: string) => void;
  onBack: () => void;
  productName?: string;
  /** Signup-created projects the invitees get member access to. */
  projectIds?: string[];
  /** Also grant access to the org's PAM product (org-scoped, no project id). */
  grantPamAccess?: boolean;
  grantAgentVaultAccess?: boolean;
  onComplete: () => void;
}

export default function TeamInviteStep({
  emails,
  onEmailsChange,
  onBack,
  productName,
  projectIds,
  grantPamAccess,
  grantAgentVaultAccess,
  onComplete
}: TeamInviteStepProps): JSX.Element {
  const { t } = useTranslation();
  const [validationError, setValidationError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { data: serverDetails } = useFetchServerStatus();

  const { mutateAsync } = useAddUsersToOrg();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["setUpEmail"] as const);

  const orgId = String(localStorage.getItem("orgData.id"));
  const grantCount =
    (projectIds?.length ?? 0) + (grantPamAccess ? 1 : 0) + (grantAgentVaultAccess ? 1 : 0);

  const inviteUsersAndContinue = async () => {
    if (isSending) return;
    const result = emailListSchema.safeParse(emails);
    if (!result.success) {
      setValidationError(result.error.issues[0].message);
      return;
    }

    const parsed = Array.from(new Set(parseEmailList(result.data)));
    setValidationError("");
    const startedAt = Date.now();
    setIsSending(true);

    try {
      const { data } = await mutateAsync({
        inviteeEmails: parsed,
        organizationId: orgId,
        organizationRoleSlug: "member",
        ...(projectIds?.length ? { projectIds } : {}),
        ...(grantPamAccess ? { grantPamAccess } : {}),
        ...(grantAgentVaultAccess ? { grantAgentVaultAccess } : {})
      });

      await waitForMinimumDuration(startedAt, 500);

      // Product grants are best-effort server-side: the invites went out, so continue,
      // but don't let the inviter believe access was granted when it wasn't.
      if (data.grantFailures) {
        createNotification({
          type: "warning",
          text: "Invites were sent, but some product access could not be granted. Grant access from each product's Access Control page."
        });
      } else {
        createNotification({
          type: "success",
          text: `${parsed.length} invitation${parsed.length === 1 ? "" : "s"} sent`
        });
      }
    } catch {
      // The global mutation error handler already surfaces a toast; stay on this step.
      setIsSending(false);
      return;
    }

    onEmailsChange("");
    onComplete();
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center">
      <AuthPagePanel>
        <CardHeader className="mb-4 gap-2">
          <CardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
            {t("signup.step5-invite-team")}
          </CardTitle>
          <CardDescription className="text-sm text-label">
            Bring in the people who&apos;ll work with {productName ?? "Infisical"} day to day.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={Boolean(validationError)}>
            <TextArea
              aria-describedby="signup-invite-feedback"
              variant="outlined"
              className="min-h-20"
              value={emails}
              disabled={isSending}
              onChange={(e) => {
                onEmailsChange(e.target.value);
                if (validationError) setValidationError("");
              }}
              placeholder="email1@example.com, email2@example.com"
              isError={Boolean(validationError)}
            />
            <FieldFeedback
              id="signup-invite-feedback"
              error={validationError}
              description={
                grantCount > 0 ? (
                  <>
                    They&apos;ll join your organization and get access to the{" "}
                    {grantCount > 1 ? "products" : "product"} you just set up.
                  </>
                ) : undefined
              }
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="neutral" onClick={onBack} isDisabled={isSending}>
              Back
            </Button>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button onClick={() => onComplete()} isDisabled={isSending} variant="ghost">
                Skip for now
              </Button>
              <Button
                onClick={() => {
                  if (serverDetails?.emailConfigured) {
                    inviteUsersAndContinue();
                  } else {
                    handlePopUpOpen("setUpEmail");
                  }
                }}
                variant="project"
                isPending={isSending}
                isDisabled={!emails.trim()}
              >
                Send invites
              </Button>
            </div>
          </div>
        </CardContent>
      </AuthPagePanel>
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </div>
  );
}
