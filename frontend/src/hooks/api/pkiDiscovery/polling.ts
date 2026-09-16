import { PkiDiscoveryScanStatus } from "./types";

export const SCAN_IN_FLIGHT_POLL_MS = 5000;
// Slow background poll while idle so a scan started elsewhere (scheduled auto-scan, or a
// stale terminal status read from a replica right after triggering) is still picked up.
export const SCAN_IDLE_POLL_MS = 30000;

export const isPkiDiscoveryScanInFlight = (status?: PkiDiscoveryScanStatus | null) =>
  status === PkiDiscoveryScanStatus.Pending || status === PkiDiscoveryScanStatus.Running;

export const getPkiDiscoveryRefetchInterval = (status?: PkiDiscoveryScanStatus | null) =>
  isPkiDiscoveryScanInFlight(status) ? SCAN_IN_FLIGHT_POLL_MS : SCAN_IDLE_POLL_MS;
