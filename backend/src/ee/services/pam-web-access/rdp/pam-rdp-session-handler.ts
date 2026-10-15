import { createPassthroughSessionHandler } from "../passthrough/pam-passthrough-session-handler";

export const handleRdpSession = createPassthroughSessionHandler({ logLabel: "rdp session", displayName: "RDP" });
