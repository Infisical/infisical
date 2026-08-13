// How often the agent re-pulls its config. The heartbeat reply is what makes a policy change
// propagate immediately, so this only bounds how long a missed heartbeat can leave the agent stale.
export const ENDPOINT_AGENT_POLL_INTERVAL_SECONDS = 5;

// A device that has not heartbeated within this window is shown as offline in the console. The agent
// heartbeats every 10s while idle, so this tolerates two missed beats.
export const ENDPOINT_DEVICE_OFFLINE_AFTER_SECONDS = 30;

// A domain target is reached through a loopback address the device claims for it, so the domain can
// keep its own name and its own port instead of being rewritten to a spare one. 127.0.0.1 is left
// alone because everything else on the machine already uses it; .2 through .254 are handed out one
// per distinct destination in a project.
export const ENDPOINT_LOOPBACK_PREFIX = "127.0.0.";
export const ENDPOINT_LOOPBACK_FIRST_OCTET = 2;
export const ENDPOINT_LOOPBACK_LAST_OCTET = 254;

export const ENDPOINT_EVENT_PAGE_SIZE_DEFAULT = 50;
export const ENDPOINT_EVENT_PAGE_SIZE_MAX = 100;

// A volume rule's threshold is a rate: bytes within a trailing window. One minute is the default
// because it is long enough to describe a transfer rather than a burst, and short enough that a device
// is not judged on what it did an hour ago. The hour cap bounds how much history an agent has to keep
// per destination.
export const ENDPOINT_DEFAULT_TRANSFER_WINDOW_SECONDS = 60;
export const ENDPOINT_MAX_TRANSFER_WINDOW_SECONDS = 3600;

// The agent reports what it sent every second or two, which is the right cadence for a live counter
// and far too fine to keep. History is banked a minute at a time: coarse enough that a day of traffic
// is a readable number of rows, fine enough to still show when a transfer happened and how fast.
export const ENDPOINT_TRANSFER_BUCKET_SECONDS = 60;

export const ENDPOINT_TRANSFER_HISTORY_DEFAULT_LOOKBACK_HOURS = 24;
export const ENDPOINT_TRANSFER_HISTORY_MAX_LOOKBACK_HOURS = 720;
export const ENDPOINT_TRANSFER_HISTORY_PAGE_SIZE_DEFAULT = 50;
export const ENDPOINT_TRANSFER_HISTORY_PAGE_SIZE_MAX = 200;

// A command is an administrator waiting at a console, not a job. Thirty seconds covers the reason
// this exists — read a file, check a service, restart a daemon — and the five minute cap is what
// stops one from pinning an agent goroutine and a row in the queue indefinitely.
export const ENDPOINT_COMMAND_DEFAULT_TIMEOUT_SECONDS = 30;
export const ENDPOINT_COMMAND_MAX_TIMEOUT_SECONDS = 300;

// How long a queued command stays runnable. A laptop can be shut for a week, and a command that
// fires on the next boot runs in a context nobody is watching and nobody predicted. Past this the
// command expires unrun and has to be reissued deliberately.
export const ENDPOINT_COMMAND_PENDING_TTL_SECONDS = 900;

// Per stream, enforced on the agent so an oversized capture never reaches the wire, and again on the
// report body. A command that prints more than this is the wrong tool: the output is meant to be
// read in a console, not shipped through one.
export const ENDPOINT_COMMAND_MAX_OUTPUT_BYTES = 64 * 1024;

export const ENDPOINT_COMMAND_MAX_LENGTH = 4096;
export const ENDPOINT_COMMAND_MAX_ARGS = 64;
export const ENDPOINT_COMMAND_MAX_ARG_LENGTH = 4096;

// One agent claim takes at most this many. It bounds a burst: if someone queues fifty commands the
// device works through them in batches rather than forking fifty processes at once.
export const ENDPOINT_COMMAND_MAX_PER_CLAIM = 5;

export const ENDPOINT_COMMAND_PAGE_SIZE_DEFAULT = 25;
export const ENDPOINT_COMMAND_PAGE_SIZE_MAX = 100;

// What is installed on a machine changes on the order of days, so the inventory rides a slow timer
// of its own rather than the heartbeat. Half an hour is frequent enough that an app installed during
// a demo shows up while anyone is still watching, and rare enough that the walk of /Applications is
// not a recurring cost.
export const ENDPOINT_APP_INVENTORY_INTERVAL_SECONDS = 1800;

// A developer's machine runs to a few hundred; the cap is what stops a mis-rooted walk from writing
// an unbounded number of rows per device.
export const ENDPOINT_MAX_APPS_PER_REPORT = 2000;
