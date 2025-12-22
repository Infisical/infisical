export enum PamSessionStatus {
  Starting = "starting", // Starting, user connecting to resource
  Active = "active", // Active, user is connected to resource
  Ended = "ended", // Ended by user or automatically expired after expiresAt timestamp
  Terminated = "terminated" // Terminated by an admin
}
