import { RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

import { sessionLogRecordKey } from "@app/hooks/api/agentVault";
import { TAgentVaultSessionLogRecord } from "@app/hooks/api/agentVault/types";

import { findRowShift } from "./SessionLogsPanel.utils";

type Params = {
  scrollRef: RefObject<HTMLDivElement | null>;
  visible: TAgentVaultSessionLogRecord[];
  arrivals: Map<string, number>;
  resetKey: string;
  rowHeight: number;
};

// Keeps the rows a reader has scrolled to in place as new ones land above them, and counts the new ones.
export const useNewRequestsCounter = ({
  scrollRef,
  visible,
  arrivals,
  resetKey,
  rowHeight
}: Params) => {
  const [newRequests, setNewRequests] = useState({ key: resetKey, count: 0 });
  if (newRequests.key !== resetKey) {
    setNewRequests({ key: resetKey, count: 0 });
  }

  const shownBefore = useRef(visible);
  // Only arrivals stamped since the last change count, so rows a filter change reveals aren't new.
  const countedAt = useRef(Date.now());
  useLayoutEffect(() => {
    const before = shownBefore.current;
    shownBefore.current = visible;
    const since = countedAt.current;
    countedAt.current = Date.now();
    const scroller = scrollRef.current;
    if (!scroller || scroller.scrollTop === 0) return;
    const top = Math.floor(scroller.scrollTop / rowHeight);
    const shift = findRowShift(before, visible, top);
    if (!shift) return;
    scroller.scrollTop += shift * rowHeight;
    if (shift < 0) return;
    const landedAbove = visible.slice(0, top + shift).filter((record) => {
      const key = sessionLogRecordKey(record);
      return (arrivals.get(key) ?? 0) > since;
    }).length;
    if (landedAbove) setNewRequests((prev) => ({ ...prev, count: prev.count + landedAbove }));
  }, [visible, arrivals, scrollRef, rowHeight]);

  const hasNewRequests = newRequests.count > 0;
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !hasNewRequests) return undefined;
    const clearAtTop = () => {
      if (scroller.scrollTop < 1) setNewRequests((prev) => ({ ...prev, count: 0 }));
    };
    scroller.addEventListener("scroll", clearAtTop, { passive: true });
    return () => scroller.removeEventListener("scroll", clearAtTop);
  }, [hasNewRequests, scrollRef]);

  const showNewRequests = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setNewRequests((prev) => ({ ...prev, count: 0 }));
  };

  return { newRequestCount: newRequests.count, showNewRequests };
};
