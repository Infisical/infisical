import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Inline } from "@app/components/v4/ui/layout";
import { toast } from "@app/components/v4/ui/sonner";
import { Textarea } from "@app/components/v4/ui/textarea";
import { emailListSchema, MAX_INVITE_EMAILS, parseEmailList } from "@app/helpers/email";
import { useAddUsersToOrg } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { waitForMinimumDuration } from "@app/lib/fn/promise";

import { AuthPage } from "../components/AuthPage";
import { EmailServiceDialog } from "../components/EmailServiceDialog";

type Props = {
  draft: string;
  onDraftChange: (draft: string) => void;
  onBack: () => void;
  productName?: string;
  projectIds?: string[];
  grantPamAccess?: boolean;
  onComplete: () => void;
  progress: React.ReactNode;
  isPreview?: boolean;
};

export const InviteStep = ({
  draft,
  onDraftChange,
  onBack,
  productName,
  projectIds,
  grantPamAccess,
  onComplete,
  progress,
  isPreview
}: Props) => {
  const [validationError, setValidationError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEmailSetupOpen, setIsEmailSetupOpen] = useState(false);
  const { data: serverDetails } = useFetchServerStatus();
  const { mutateAsync } = useAddUsersToOrg();
  const grantCount = (projectIds?.length ?? 0) + (grantPamAccess ? 1 : 0);

  const inviteUsersAndContinue = async () => {
    if (isSending || isPreview) return;
    const result = emailListSchema({ max: MAX_INVITE_EMAILS, isRequired: true }).safeParse(
      parseEmailList([draft])
    );
    if (!result.success) {
      setValidationError(result.error.issues[0].message);
      return;
    }

    const parsed = result.data;
    setValidationError("");
    const startedAt = Date.now();
    setIsSending(true);

    try {
      const { data } = await mutateAsync({
        inviteeEmails: parsed,
        organizationId: String(localStorage.getItem("orgData.id")),
        organizationRoleSlug: "member",
        ...(projectIds?.length ? { projectIds } : {}),
        ...(grantPamAccess ? { grantPamAccess } : {})
      });
      await waitForMinimumDuration(startedAt, 500);
      if (data.grantFailures) {
        toast.warning(
          "Invites were sent, but some product access could not be granted. Grant access from each product's Access Control page."
        );
      } else {
        toast.success(`${parsed.length} invitation${parsed.length === 1 ? "" : "s"} sent`);
      }
    } catch {
      setIsSending(false);
      return;
    }

    onDraftChange("");
    onComplete();
  };

  let description: string | undefined;
  if (grantCount > 0) {
    description = `They'll join your organization and get access to the ${
      grantCount > 1 ? "products" : "product"
    } you just set up.`;
  }

  return (
    <AuthPage
      pageTitle="Sign Up"
      title="Invite your team"
      description={`Bring in the people who'll work with ${productName ?? "Infisical"} day to day.`}
      progress={progress}
      variant="focused"
      wide
    >
      <Field label="Teammate emails" description={description} error={validationError || undefined}>
        <Textarea
          value={draft}
          rows={3}
          disabled={isSending}
          placeholder="email1@example.com, email2@example.com"
          onChange={(event) => {
            onDraftChange(event.target.value);
            if (validationError) setValidationError("");
          }}
        />
      </Field>
      <Inline justify="between">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSending}>
          Back
        </Button>
        <Inline gap={8}>
          <Button type="button" variant="ghost" onClick={() => onComplete()} disabled={isSending}>
            Skip for now
          </Button>
          <Button
            type="button"
            variant="accent"
            loading={isSending}
            disabled={!draft.trim()}
            onClick={() => {
              if (serverDetails?.emailConfigured) inviteUsersAndContinue();
              else setIsEmailSetupOpen(true);
            }}
          >
            Send invites
          </Button>
        </Inline>
      </Inline>
      <EmailServiceDialog open={isEmailSetupOpen} onOpenChange={setIsEmailSetupOpen} />
    </AuthPage>
  );
};
