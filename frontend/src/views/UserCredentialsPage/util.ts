import { CredentialKind } from "@app/hooks/api/userCredentials/types";

export function readableCredentialKind(kind: CredentialKind) {
  switch (kind) {
    case CredentialKind.login:
      return "Login";
    case CredentialKind.secureNote:
      return "Secure Note";
    default:
      // This arm is unreachable.
      // But TypeScript's exhaustiveness checking doesn't always work well with enums.
      return "Unknown";
  }
}

