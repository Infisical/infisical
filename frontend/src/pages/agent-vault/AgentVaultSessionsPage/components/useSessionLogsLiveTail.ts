import { useEffect, useState } from "react";

import { type DateRangeFilterResult } from "@app/components/v3";
import { AgentVaultSessionStatus } from "@app/hooks/api/agentVault";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";

// A proxy uploads what it still holds on its next flush, up to a minute after the session ends, so
// the view keeps checking for new requests a while longer.
const SESSION_END_TAIL_MS = 2 * 60_000;

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const endTailDeadline = (session: TAgentVaultSession) => {
  const endedAt =
    session.revokedAt ??
    (session.status === AgentVaultSessionStatus.Expired ? session.expiresAt : null);
  return endedAt ? new Date(endedAt).getTime() + SESSION_END_TAIL_MS : null;
};

// Decides whether the panel polls for new requests: while the session runs, for a short while after it
// ends, and only while the picked range still reaches the present.
export const useSessionLogsLiveTail = (session: TAgentVaultSession) => {
  const [range, setRange] = useState<DateRangeFilterResult | null>(null);
  const [isRangeOpen, setIsRangeOpen] = useState(true);
  const applyRange = (next: DateRangeFilterResult | null) => {
    setRange(next);
    setIsRangeOpen(!next || next.endDate.getTime() > Date.now());
  };
  useEffect(() => {
    if (!range || !isRangeOpen) return undefined;
    const remaining = range.endDate.getTime() - Date.now();
    if (remaining > MAX_TIMEOUT_MS) return undefined;
    const timer = setTimeout(() => setIsRangeOpen(false), Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [range, isRangeOpen]);

  const isActive = session.status === AgentVaultSessionStatus.Active;
  const tailEndsAt = endTailDeadline(session);
  const [endTail, setEndTail] = useState(() => ({
    endsAt: tailEndsAt,
    isOpen: tailEndsAt !== null && tailEndsAt > Date.now()
  }));
  if (endTail.endsAt !== tailEndsAt) {
    setEndTail({ endsAt: tailEndsAt, isOpen: tailEndsAt !== null && tailEndsAt > Date.now() });
  }
  useEffect(() => {
    const { endsAt, isOpen } = endTail;
    if (endsAt === null || !isOpen) return undefined;
    const timer = setTimeout(
      () => setEndTail({ endsAt, isOpen: false }),
      Math.max(endsAt - Date.now(), 0)
    );
    return () => clearTimeout(timer);
  }, [endTail]);
  const isTailingEnd = endTail.endsAt === tailEndsAt && endTail.isOpen;

  const liveScope = [session.id, range?.startDate.getTime(), range?.endDate.getTime()].join("|");
  const [budgetLatch, setBudgetLatch] = useState({ scope: liveScope, isOver: false });
  if (budgetLatch.scope !== liveScope) {
    setBudgetLatch({ scope: liveScope, isOver: false });
  }
  const isPausedForBudget = budgetLatch.scope === liveScope && budgetLatch.isOver;
  const pauseForBudget = () => setBudgetLatch({ scope: liveScope, isOver: true });

  const canTail = (isActive || isTailingEnd) && isRangeOpen;

  return {
    range,
    applyRange,
    isActive,
    canTail,
    isLive: canTail && !isPausedForBudget,
    isPausedForBudget,
    pauseForBudget
  };
};
