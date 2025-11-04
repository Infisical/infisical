import { useState } from "react";
import { UseMutationResult } from "@tanstack/react-query";
import ms from "ms";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";

import { IdentityAuthFieldDisplay } from "./IdentityAuthFieldDisplay";

export const LockoutFields = ({
  clearLockoutsResult,
  lockedOut,
  identityId,
  data,
  onResetAllLockouts
}: {
  clearLockoutsResult: UseMutationResult<number, object, { identityId: string }, unknown>;
  lockedOut: boolean;
  identityId: string;
  data: {
    lockoutEnabled: boolean;
    lockoutThreshold: number;
    lockoutDurationSeconds: number;
    lockoutCounterResetSeconds: number;
  };
  onResetAllLockouts: () => void;
}) => {
  const { mutateAsync, isPending } = clearLockoutsResult;

  const [lockedOutState, setLockedOutState] = useState(lockedOut);

  const clearLockouts = async () => {
    const deleted = await mutateAsync({ identityId });
    createNotification({
      text: `Successfully cleared ${deleted} lockout${deleted === 1 ? "" : "s"}`,
      type: "success"
    });
    setLockedOutState(false);
    onResetAllLockouts();
  };

  return (
    <>
      <div className="col-span-2 mt-3 flex justify-between border-b border-mineshaft-500 pb-2">
        <span className="text-bunker-300">Lockout Options</span>
        <OrgPermissionCan I={OrgPermissionIdentityActions.Edit} a={OrgPermissionSubjects.Identity}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed || !lockedOutState || isPending}
              size="xs"
              onClick={() => clearLockouts()}
              isLoading={isPending}
              colorSchema="secondary"
            >
              Reset All Lockouts
            </Button>
          )}
        </OrgPermissionCan>
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
