import { RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VirtualItem } from "@tanstack/react-virtual";

import { TAgentVaultSessionLogRecord } from "@app/hooks/api/agentVault/types";

import { countSessionLogArrivals, followSessionLogRowAnchor } from "./SessionLogsPanel.utils";

type Params = {
  scrollRef: RefObject<HTMLDivElement | null>;
  visible: TAgentVaultSessionLogRecord[];
  // The virtualizer's measurements for `visible`, so rows that were expanded count at their real height.
  measuredRows: VirtualItem[];
  arrivals: Map<string, number>;
  resetKey: string;
};

// Keeps the rows a reader has scrolled to in place as new ones land above them, and counts the new ones.
export const useNewRequestsCounter = ({
  scrollRef,
  visible,
  measuredRows,
  arrivals,
  resetKey
}: Params) => {
  const [newRequests, setNewRequests] = useState({ key: resetKey, count: 0 });
  if (newRequests.key !== resetKey) {
    setNewRequests({ key: resetKey, count: 0 });
  }

  const shownBefore = useRef(visible);
  const measuredBefore = useRef(measuredRows);
  const isReturningToTop = useRef(false);
  // Only arrivals stamped since the last change count, so rows a filter change reveals aren't new.
  const countedAt = useRef(Date.now());
  useLayoutEffect(() => {
    const before = measuredBefore.current;
    measuredBefore.current = measuredRows;
    if (shownBefore.current === visible) return;
    shownBefore.current = visible;
    const since = countedAt.current;
    countedAt.current = Date.now();
    const scroller = scrollRef.current;
    // Correcting for rows that land during the smooth scroll to the top would stop it short.
    if (!scroller || scroller.scrollTop === 0 || isReturningToTop.current) return;
    // The scroll offset still describes the previous rows here, since overflow anchoring is off.
    const moved = followSessionLogRowAnchor(before, measuredRows, scroller.scrollTop);
    if (!moved) return;
    if (Math.abs(moved.scrollTop - scroller.scrollTop) >= 1) scroller.scrollTop = moved.scrollTop;
    const landedAbove = countSessionLogArrivals(visible.slice(0, moved.index), arrivals, since);
    if (landedAbove) setNewRequests((prev) => ({ ...prev, count: prev.count + landedAbove }));
  }, [visible, measuredRows, arrivals, scrollRef]);

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
    const scroller = scrollRef.current;
    setNewRequests((prev) => ({ ...prev, count: 0 }));
    if (!scroller || scroller.scrollTop < 1) return;
    isReturningToTop.current = true;
    const listening = new AbortController();
    const stopReturning = () => {
      isReturningToTop.current = false;
      listening.abort();
    };
    const { signal } = listening;
    scroller.addEventListener(
      "scroll",
      () => {
        if (scroller.scrollTop < 1) stopReturning();
      },
      { passive: true, signal }
    );
    scroller.addEventListener("scrollend", stopReturning, { signal });
    // The reader can take over before the smooth scroll reaches the top.
    scroller.addEventListener("wheel", stopReturning, { passive: true, signal });
    scroller.addEventListener("touchstart", stopReturning, { passive: true, signal });
    scroller.scrollTo({ top: 0, behavior: "smooth" });
  };

  return { newRequestCount: newRequests.count, showNewRequests };
};
