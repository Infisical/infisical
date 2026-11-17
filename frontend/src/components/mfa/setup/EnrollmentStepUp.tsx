import { ComponentProps } from "react";

import { Button } from "@app/components/v3";
import { TMfaStepUpChallenge } from "@app/helpers/mfaSession";

import { MFA_CHALLENGE_PROMPTS, MfaSessionChallenge } from "../MfaSessionChallenge";

type Props = {
  challenge: TMfaStepUpChallenge;
  onVerified: () => void | Promise<void>;
  // Login-time setup only: a user who can't pass this prompt has no other way in.
  onUseRecoveryCode?: () => void;
  variant?: ComponentProps<typeof Button>["variant"];
};

// Shown inline rather than in the step-up popup, because login-time enrollment runs
// before an org is selected and the popup's route requires one.
export const EnrollmentStepUp = ({ challenge, onVerified, onUseRecoveryCode, variant }: Props) => (
  <div className="flex flex-col gap-4">
    <p className="text-sm text-muted">{MFA_CHALLENGE_PROMPTS[challenge.mfaMethod]}</p>
    <MfaSessionChallenge
      key={challenge.mfaSessionId}
      mfaSessionId={challenge.mfaSessionId}
      mfaMethod={challenge.mfaMethod}
      onVerified={onVerified}
      variant={variant}
    />
    {onUseRecoveryCode && (
      <p className="text-center text-sm text-muted">
        Can&apos;t access your other two-factor method?{" "}
        <button
          type="button"
          onClick={onUseRecoveryCode}
          className="cursor-pointer text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
        >
          Use a recovery code
        </button>
      </p>
    )}
  </div>
);
