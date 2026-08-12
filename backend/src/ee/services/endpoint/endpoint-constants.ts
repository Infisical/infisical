// How often the agent re-pulls its config. The heartbeat reply is what makes a policy change
// propagate immediately, so this only bounds how long a missed heartbeat can leave the agent stale.
export const ENDPOINT_AGENT_POLL_INTERVAL_SECONDS = 5;

// A device that has not heartbeated within this window is shown as offline in the console. The agent
// heartbeats every 10s while idle, so this tolerates two missed beats.
export const ENDPOINT_DEVICE_OFFLINE_AFTER_SECONDS = 30;

export const ENDPOINT_EVENT_PAGE_SIZE_DEFAULT = 50;
export const ENDPOINT_EVENT_PAGE_SIZE_MAX = 100;
