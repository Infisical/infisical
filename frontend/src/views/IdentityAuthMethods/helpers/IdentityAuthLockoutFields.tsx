import ms from "ms";

import { IdentityAuthMethod } from "@app/hooks/api";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";
import { ResetLockoutsButton } from "./ResetLockoutsButton";

type Props = {
  identityId: string;
  authMethod: IdentityAuthMethod;
  isLockedOut: boolean;
  onResetSuccess: () => void;
  data: {
    lockoutThreshold: number;
    lockoutDurationSeconds: number;
    lockoutCounterResetSeconds: number;
  };
};

export const IdentityAuthLockoutFields = ({
  identityId,
  authMethod,
  isLockedOut,
  onResetSuccess,
  data
}: Props) => {
  return (
    <>
      <div className="col-span-2 mt-3 flex items-center justify-between border-b border-border pb-2 text-foreground">
        Lockout Options
        {isLockedOut && (
          <ResetLockoutsButton
            identityId={identityId}
            authMethod={authMethod}
            onSuccess={onResetSuccess}
          />
        )}
      </div>
      <IdentityAuthFieldDisplay label="Lockout Threshold">
        {data.lockoutThreshold}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout Duration">
        {ms(data.lockoutDurationSeconds * 1000, { long: true })}
      </IdentityAuthFieldDisplay>
      <IdentityAuthFieldDisplay label="Lockout Counter Reset">
        {ms(data.lockoutCounterResetSeconds * 1000, { long: true })}
      </IdentityAuthFieldDisplay>
    </>
  );
};
