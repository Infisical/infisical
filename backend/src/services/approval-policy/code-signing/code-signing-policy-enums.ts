export enum CodeSigningScopeField {
  Command = "command",
  SigningApplication = "signingApplication",
  SigningApplicationHash = "signingApplicationHash",
  Hostname = "hostname",
  OsUsername = "osUsername",
  IpAddress = "ipAddress",
  DataHash = "dataHash"
}

export const CODE_SIGNING_SCOPE_FIELD_LABELS: Record<CodeSigningScopeField, string> = {
  [CodeSigningScopeField.Command]: "command",
  [CodeSigningScopeField.SigningApplication]: "signing application",
  [CodeSigningScopeField.SigningApplicationHash]: "signing application checksum",
  [CodeSigningScopeField.Hostname]: "hostname",
  [CodeSigningScopeField.OsUsername]: "OS username",
  [CodeSigningScopeField.IpAddress]: "IP address",
  [CodeSigningScopeField.DataHash]: "data digest"
};
