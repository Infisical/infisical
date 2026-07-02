import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useUser
} from "@app/context";
import { fetchSecretsActivationStatus, userActivationKeys } from "@app/hooks/api";

import { usePopUp } from "./usePopUp";

// Mirrors ORG_MAX_AGE_MONTHS in the backend user-activation service. This is only a cheap
// client-side pre-filter to avoid needless calls; the backend gates remain authoritative.
const USER_ACTIVATION_MAX_AGE_MONTHS = 2;

// Small delay before opening the modal so it doesn't pop the instant the page settles or a
// secret is created, which reads as abrupt. Tunable.
const ACTIVATION_NUDGE_DELAY_MS = 2000;

// Growth nudge for the secret overview page. `checkActivation` can be called from multiple
// triggers (the project having secrets, or a secret being created), but it runs the request at
// most once per session: the result is cached (gcTime Infinity) and we skip entirely
// once it is present, so the modal never re-opens on remount. The check is also gated on the user
// being able to invite members and being recent, opens the modal only if the backend says so, and
// is a no-op if the request fails.
export const useSecretsActivationNudge = () => {
  const { user } = useUser();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const queryClient = useQueryClient();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["inviteMembers"] as const);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cancel a pending open if the consumer unmounts before the delay elapses.
  useEffect(
    () => () => {
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
    },
    []
  );

  const canInviteMembers = permission.can(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.Member
  );

  const isRecentUser = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - USER_ACTIVATION_MAX_AGE_MONTHS);
    return new Date(user.createdAt).getTime() >= cutoff.getTime();
  }, [user.createdAt]);

  const checkActivation = useCallback(async () => {
    if (!canInviteMembers || !isRecentUser || !currentOrg?.id) return;

    const queryKey = userActivationKeys.secretsStatus(currentOrg.id, user.id);
    // Already checked this session (cached): don't call again and don't re-open the modal.
    if (queryClient.getQueryData(queryKey) !== undefined) return;

    try {
      const data = await queryClient.ensureQueryData({
        queryKey,
        queryFn: fetchSecretsActivationStatus,
        retry: false,
        gcTime: Infinity
      });
      if (data.shouldShowActivation) {
        // Give the page a beat before nudging so it doesn't feel abrupt.
        if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
        openTimeoutRef.current = setTimeout(() => {
          handlePopUpOpen("inviteMembers");
        }, ACTIVATION_NUDGE_DELAY_MS);
      }
    } catch {
      // Silent by design: a failed activation check must not disrupt the page.
    }
  }, [canInviteMembers, isRecentUser, currentOrg?.id, user.id, queryClient, handlePopUpOpen]);

  return { popUp, handlePopUpToggle, checkActivation };
};
