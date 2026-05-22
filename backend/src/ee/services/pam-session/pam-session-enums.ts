export enum PamSessionStatus {
  Starting = "starting", // Starting, user connecting to resource
  Active = "active", // Active, user is connected to resource
  Ended = "ended", // Ended by user or automatically expired after expiresAt timestamp
  Terminated = "terminated" // Terminated by an admin
}

export enum SessionChannelType {
  Terminal = "terminal", // Interactive SSH terminal session
  Exec = "exec", // SSH exec command
  Sftp = "sftp", // SFTP file transfer session
  Rdp = "rdp" // RDP frame/input tap; data carries an RDP-specific JSON envelope
}
