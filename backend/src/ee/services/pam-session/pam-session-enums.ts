export enum PamSessionStatus {
  Starting = "starting", // Starting, user connecting to resource
  Active = "active", // Active, user is connected to resource
  Ended = "ended", // Ended by user
  Terminated = "terminated", // Terminated by an admin
  Expired = "expired" // Automatically expired after expiresAt timestamp
}
