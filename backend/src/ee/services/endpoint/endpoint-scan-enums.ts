export enum EndpointSecretFindingStatus {
  Open = "open",
  // Set by the backend, not the agent: a finding the newest scan of the same root no longer reports.
  // That is how "the employee deleted the file" shows up in the console on its own.
  Resolved = "resolved"
}

export enum EndpointScanTrigger {
  Schedule = "schedule",
  Requested = "requested"
}
