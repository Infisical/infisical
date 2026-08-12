// How often the agent re-pulls its config. The heartbeat reply is what makes a policy change
// propagate immediately, so this only bounds how long a missed heartbeat can leave the agent stale.
export const ENDPOINT_AGENT_POLL_INTERVAL_SECONDS = 5;

// A device that has not heartbeated within this window is shown as offline in the console. The agent
// heartbeats every 10s while idle, so this tolerates two missed beats.
export const ENDPOINT_DEVICE_OFFLINE_AFTER_SECONDS = 30;

export const ENDPOINT_EVENT_PAGE_SIZE_DEFAULT = 50;
export const ENDPOINT_EVENT_PAGE_SIZE_MAX = 100;

// A volume rule's threshold is a rate: bytes within a trailing window. One minute is the default
// because it is long enough to describe a transfer rather than a burst, and short enough that a device
// is not judged on what it did an hour ago. The hour cap bounds how much history an agent has to keep
// per destination.
export const ENDPOINT_DEFAULT_TRANSFER_WINDOW_SECONDS = 60;
export const ENDPOINT_MAX_TRANSFER_WINDOW_SECONDS = 3600;
