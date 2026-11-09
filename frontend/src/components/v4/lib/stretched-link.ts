import * as React from "react";

import { type PresenceReport, usePresenceCount, useReportPresence } from "./presence-count";

const StretchedLinkContext = React.createContext<PresenceReport | null>(null);

/**
 * A table row or Card whose stretched RowLink or CardLink covers it. Hosts nest: an outer row or Card
 * also counts a link inside an inner one, as the selectors this replaces matched at any depth.
 */
export function useStretchedLinkHost() {
  const [hasLink, report] = usePresenceCount();
  useReportPresence(React.useContext(StretchedLinkContext), hasLink);
  return [hasLink, report] as const;
}

export function useStretchedLink(active: boolean) {
  useReportPresence(React.useContext(StretchedLinkContext), active);
}

export { StretchedLinkContext };
