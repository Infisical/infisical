import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Separator,
  TextArea
} from "@app/components/v3";
import { useAddUsersToOrg } from "@app/hooks/api";
import { submitSignupOnboarding } from "@app/hooks/api/auth/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { usePopUp } from "@app/hooks/usePopUp";

import { EmailServiceSetupModal } from "../v2";
import { AuthPagePanel } from "./AuthPagePanel";

interface TeamInviteStepProps {
  productName?: string;
  /** Signup-created projects the invitees get member access to. */
  projectIds?: string[];
  /** Also grant access to the org's PAM product (org-scoped, no project id). */
  grantPamAccess?: boolean;
  onComplete: () => void;
}

export default function TeamInviteStep({
  productName,
  projectIds,
  grantPamAccess,
  onComplete
}: TeamInviteStepProps): JSX.Element {
  const { t } = useTranslation();
  const [emails, setEmails] = useState("");
  const [attributionSource, setAttributionSource] = useState("");
  const [validationError, setValidationError] = useState("");
  const { data: serverDetails } = useFetchServerStatus();

  const { mutateAsync, isPending } = useAddUsersToOrg();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["setUpEmail"] as const);

  const orgId = String(localStorage.getItem("orgData.id"));
  const grantCount = (projectIds?.length ?? 0) + (grantPamAccess ? 1 : 0);

  const finishStep = () => {
    const trimmedAttribution = attributionSource.trim();
    if (trimmedAttribution) {
      submitSignupOnboarding({ attributionSource: trimmedAttribution }).catch(() => {});
    }
    onComplete();
  };

  const inviteUsersAndContinue = async () => {
    const parsed = emails
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      setValidationError("Please enter at least one email address, or skip for now.");
      return;
    }

    const invalid = parsed.filter((email) => !z.string().email().safeParse(email).success);
    if (invalid.length > 0) {
      setValidationError(`Invalid email${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}`);
      return;
    }

    setValidationError("");

    try {
      const { data } = await mutateAsync({
        inviteeEmails: parsed,
        organizationId: orgId,
        organizationRoleSlug: "member",
        ...(projectIds?.length ? { projectIds } : {}),
        ...(grantPamAccess ? { grantPamAccess } : {})
      });

      // Product grants are best-effort server-side: the invites went out, so continue,
      // but don't let the inviter believe access was granted when it wasn't.
      if (data.grantFailures) {
        createNotification({
          type: "warning",
          text: "Invites were sent, but some product access could not be granted. Grant access from each product's Access Control page."
        });
      }
    } catch {
      // The global mutation error handler already surfaces a toast; stay on this step.
      return;
    }

    finishStep();
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
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
              variant="outlined"
              className="min-h-20"
              value={emails}
              onChange={(e) => {
                setEmails(e.target.value);
                if (validationError) setValidationError("");
              }}
              placeholder="email1@example.com, email2@example.com"
              isError={Boolean(validationError)}
            />
            {validationError && <FieldError>{validationError}</FieldError>}
            {grantCount > 0 && (
              <FieldDescription>
                They&apos;ll join your organization and get access to the{" "}
                {grantCount > 1 ? "products" : "product"} you just set up.
              </FieldDescription>
            )}
          </Field>
          <Separator />
          <Field>
            <FieldLabel htmlFor="signup-attribution-source">
              Where did you hear about us?{" "}
              <span className="font-normal text-muted">(optional)</span>
            </FieldLabel>
            <Input
              id="signup-attribution-source"
              value={attributionSource}
              onChange={(e) => setAttributionSource(e.target.value)}
              placeholder="e.g. Hacker News, a friend, GitHub..."
              maxLength={512}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                if (serverDetails?.emailConfigured) {
                  inviteUsersAndContinue();
                } else {
                  handlePopUpOpen("setUpEmail");
                }
              }}
              variant="project"
              size="lg"
              isFullWidth
              isPending={isPending}
            >
              Send Invites & Continue
            </Button>
            <Button
              onClick={finishStep}
              isDisabled={isPending}
              variant="ghost"
              size="lg"
              isFullWidth
            >
              Skip for Now
            </Button>
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
