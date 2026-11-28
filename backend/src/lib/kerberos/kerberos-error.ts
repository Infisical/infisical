import { KerberosFailureReason } from "./kerberos-types";

export class KerberosError extends Error {
  name: string;

  reason: KerberosFailureReason;

  serviceName?: string;

  keyVersion?: number | null;

  clientName?: string;

  constructor({
    reason,
    message,
    serviceName,
    keyVersion,
    clientName
  }: {
    reason: KerberosFailureReason;
    message: string;
    serviceName?: string;
    keyVersion?: number | null;
    clientName?: string;
  }) {
    super(message);
    this.name = "KerberosError";
    this.reason = reason;
    this.serviceName = serviceName;
    this.keyVersion = keyVersion;
    this.clientName = clientName;
  }
}
