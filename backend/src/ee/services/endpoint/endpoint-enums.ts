export enum EndpointDeviceStatus {
  Active = "active",
  Inactive = "inactive"
}

export enum EndpointNetworkRuleType {
  Destination = "destination",
  Volume = "volume"
}

export enum EndpointNetworkRuleAction {
  Deny = "deny",
  Allow = "allow"
}

export enum EndpointDestinationKind {
  Ip = "ip",
  Cidr = "cidr",
  Domain = "domain"
}

// Deliberately not EndpointDestinationKind, which also carries 'cidr'. A CIDR target needs a TUN
// device, split-tunnel routing and DNS interception on the agent, all of which are roadmap — and an
// enum that accepts a value nothing can enforce is how a dead option reaches the console.
export enum EndpointTargetKind {
  Domain = "domain",
  Ip = "ip"
}

// Pending and Dispatched are the only states an agent can move out of, and every other state is
// terminal. Failed means the command ran and exited non-zero; Errored means the agent could not run
// it at all. Keeping those apart is what lets someone tell a broken command from a broken device.
export enum EndpointCommandStatus {
  Pending = "pending",
  Dispatched = "dispatched",
  Succeeded = "succeeded",
  Failed = "failed",
  Errored = "errored",
  TimedOut = "timed_out",
  Canceled = "canceled",
  Expired = "expired"
}

// Where an installed application lives on disk. System is an install every account on the machine
// shares; User is one that only the device owner has, which is the interesting half for an admin —
// nobody provisioned it.
export enum EndpointDeviceAppSource {
  System = "system",
  User = "user"
}

export enum EndpointEventType {
  AgentStarted = "agent.started",
  AgentStopped = "agent.stopped",
  NetworkPolicyApplied = "network.policy_applied",
  NetworkDestinationBlocked = "network.destination_blocked",
  NetworkTransferThresholdTripped = "network.transfer_threshold_tripped",
  PrivateAccessTunnelUp = "private_access.tunnel_up",
  PrivateAccessTunnelDown = "private_access.tunnel_down",
  // Written by the backend, not the agent: these are the record of who ran what on someone's
  // machine, so the device that ran it is the last thing that should be authoring them.
  CommandIssued = "command.issued",
  CommandCompleted = "command.completed",
  // The agent sends every event through one batched endpoint, so a type missing from this enum fails
  // validation for the whole batch and takes the network events down with it.
  ScanStarted = "scan.started",
  ScanCompleted = "scan.completed"
}
