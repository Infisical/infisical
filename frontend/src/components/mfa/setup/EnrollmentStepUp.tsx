import { ComponentProps } from "react";

import { Button } from "@app/components/v3";
import { TMfaStepUpChallenge } from "@app/helpers/mfaSession";

import { MFA_CHALLENGE_PROMPTS, MfaSessionChallenge } from "../MfaSessionChallenge";

type Props = {
  challenge: TMfaStepUpChallenge;
  onVerified: () => void | Promise<void>;
  variant?: ComponentProps<typeof Button>["variant"];
};

// Shown inline rather than in the step-up popup, because login-time enrollment runs
// before an org is selected and the popup's route requires one.
export const EnrollmentStepUp = ({ challenge, onVerified, variant }: Props) => (
  <div className="flex flex-col gap-4">
    <p className="text-sm text-muted">
      Verify with your existing two-factor method before adding a new one.{" "}
      {MFA_CHALLENGE_PROMPTS[challenge.mfaMethod]}
    </p>
    <MfaSessionChallenge
      key={challenge.mfaSessionId}
      mfaSessionId={challenge.mfaSessionId}
      mfaMethod={challenge.mfaMethod}
      onVerified={onVerified}
      variant={variant}
    />
  </div>
);
