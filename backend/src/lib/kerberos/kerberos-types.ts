export enum KerberosFailureReason {
  NoTicket = "no-ticket",
  Ntlm = "ntlm",
  MalformedToken = "malformed-token",
  NoMatchingKey = "no-matching-key",
  DecryptFailed = "decrypt-failed",
  ClientMismatch = "client-mismatch",
  ClockSkew = "clock-skew",
  Expired = "expired",
  Replay = "replay",
  MissingPac = "missing-pac",
  InvalidPacSignature = "invalid-pac-signature",
  NotComputerAccount = "not-computer-account",
  MissingChannelBinding = "missing-channel-binding",
  ChannelBindingMismatch = "channel-binding-mismatch"
}

export enum KerberosEncryptionType {
  Aes128CtsHmacSha196 = 17,
  Aes256CtsHmacSha196 = 18
}

export enum KerberosKeyUsage {
  TicketEncPart = 2,
  ApRequestAuthenticator = 11,
  ApReplyEncPart = 12,
  PacChecksum = 17
}

export type TKeytabEntry = {
  realm: string;
  principal: string;
  keyVersion: number;
  encryptionType: KerberosEncryptionType;
  key: Buffer;
};

export type TKerberosIdentity = {
  clientName: string;
  realm: string;
  serviceName: string;
  keyVersion: number;
  accountSid: string;
  groupSids: string[];
  domainSid: string;
};

export type TNegotiateToken = {
  isSpnego: boolean;
  mechanismOid: string;
  isMutualRequired: boolean;
  serviceName: string;
  ticketEncryptionType: number;
  ticketKeyVersion: number | null;
  ticketCipher: Buffer;
  authenticatorCipher: Buffer;
};

export type TVerifyNegotiateTokenDTO = {
  negotiateToken: TNegotiateToken;
  keytabEntries: TKeytabEntry[];
  checkReplay: (replayKey: string) => Promise<boolean>;
  expectedChannelBindings: Buffer[] | null;
};
