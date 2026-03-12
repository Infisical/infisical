import { TLogLevel } from "./observability-widget-types";

const ERROR_EVENT_PATTERNS = [
  "failed",
  "fail-",
  "-fail",
  "error",
  "reject",
  "revoke",
  "delete",
  "remove"
] as const;

const WARN_EVENT_PATTERNS = ["retry", "denied", "expired", "closed", "update", "reconcile"] as const;

export const getLogLevel = (eventType: string): TLogLevel => {
  const lowerEventType = eventType.toLowerCase();

  if (ERROR_EVENT_PATTERNS.some((pattern) => lowerEventType.includes(pattern))) {
    return "error";
  }

  if (WARN_EVENT_PATTERNS.some((pattern) => lowerEventType.includes(pattern))) {
    return "warn";
  }

  return "info";
};

const formatActorName = (actor: string, actorMetadata: unknown): string => {
  if (!actorMetadata || typeof actorMetadata !== "object") {
    return actor;
  }

  const metadata = actorMetadata as Record<string, unknown>;

  if (metadata.email && typeof metadata.email === "string") {
    return metadata.email;
  }

  if (metadata.name && typeof metadata.name === "string") {
    return metadata.name;
  }

  if (metadata.identityId && typeof metadata.identityId === "string") {
    return `identity:${metadata.identityId.substring(0, 8)}`;
  }

  if (metadata.userId && typeof metadata.userId === "string") {
    return `user:${metadata.userId.substring(0, 8)}`;
  }

  return actor;
};

const EVENT_TYPE_MESSAGES: Record<string, string> = {
  "get-secrets": "Retrieved secrets",
  "get-secret": "Retrieved secret",
  "reveal-secret": "Revealed secret value",
  "create-secret": "Created secret",
  "create-secrets": "Created secrets",
  "update-secret": "Updated secret",
  "update-secrets": "Updated secrets",
  "delete-secret": "Deleted secret",
  "delete-secrets": "Deleted secrets",
  "move-secrets": "Moved secrets",

  "create-webhook": "Created webhook",
  "update-webhook-status": "Updated webhook status",
  "delete-webhook": "Deleted webhook",
  "webhook-triggered": "Webhook triggered",

  "create-secret-sync": "Created secret sync",
  "update-secret-sync": "Updated secret sync",
  "delete-secret-sync": "Deleted secret sync",
  "secret-sync-sync-secrets": "Synced secrets",
  "secret-sync-import-secrets": "Imported secrets from sync",
  "secret-sync-remove-secrets": "Removed synced secrets",

  "create-secret-rotation": "Created secret rotation",
  "update-secret-rotation": "Updated secret rotation",
  "delete-secret-rotation": "Deleted secret rotation",
  "secret-rotation-rotate-secrets": "Rotated secrets",
  "reconcile-secret-rotation": "Reconciled secret rotation",

  "login-identity-universal-auth": "Machine identity login (Universal Auth)",
  "login-identity-kubernetes-auth": "Machine identity login (Kubernetes)",
  "login-identity-aws-auth": "Machine identity login (AWS)",
  "login-identity-gcp-auth": "Machine identity login (GCP)",
  "login-identity-azure-auth": "Machine identity login (Azure)",
  "login-identity-oidc-auth": "Machine identity login (OIDC)",

  "create-identity": "Created machine identity",
  "update-identity": "Updated machine identity",
  "delete-identity": "Deleted machine identity",

  "create-environment": "Created environment",
  "update-environment": "Updated environment",
  "delete-environment": "Deleted environment",

  "create-folder": "Created folder",
  "update-folder": "Updated folder",
  "delete-folder": "Deleted folder",

  "add-project-member": "Added project member",
  "remove-project-member": "Removed project member",

  "issue-cert": "Issued certificate",
  "revoke-cert": "Revoked certificate",
  "delete-cert": "Deleted certificate",
  "sign-cert": "Signed certificate",
  "import-cert": "Imported certificate",

  "automated-renew-certificate-failed": "Automated certificate renewal failed",
  "pam-account-credential-rotation-failed": "PAM credential rotation failed",
  "fail-acme-challenge": "ACME challenge failed"
};

export const formatLogMessage = (eventType: string, actorMetadata: unknown, eventMetadata: unknown): string => {
  const baseMessage = EVENT_TYPE_MESSAGES[eventType];

  if (baseMessage) {
    return enrichMessageWithMetadata(baseMessage, eventMetadata);
  }

  return humanizeEventType(eventType);
};

const enrichMessageWithMetadata = (message: string, eventMetadata: unknown): string => {
  if (!eventMetadata || typeof eventMetadata !== "object") {
    return message;
  }

  const metadata = eventMetadata as Record<string, unknown>;
  const parts: string[] = [message];

  if (metadata.environment && typeof metadata.environment === "string") {
    parts.push(`in ${metadata.environment}`);
  }

  if (metadata.secretPath && typeof metadata.secretPath === "string") {
    parts.push(`at ${metadata.secretPath}`);
  }

  if (metadata.secretKey && typeof metadata.secretKey === "string") {
    parts.push(`(${metadata.secretKey})`);
  }

  if (metadata.destination && typeof metadata.destination === "string") {
    parts.push(`to ${metadata.destination}`);
  }

  if (metadata.errorMessage && typeof metadata.errorMessage === "string") {
    parts.push(`- ${metadata.errorMessage}`);
  }

  return parts.join(" ");
};

const humanizeEventType = (eventType: string): string => {
  return eventType
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const getResourceTypeFromEventType = (eventType: string): string => {
  const lowerEventType = eventType.toLowerCase();

  if (lowerEventType.includes("secret-sync")) return "secret_sync";
  if (lowerEventType.includes("secret-rotation")) return "secret_rotation";
  if (lowerEventType.includes("webhook")) return "webhook";
  if (lowerEventType.includes("identity")) return "identity";
  if (lowerEventType.includes("cert")) return "certificate";
  if (lowerEventType.includes("ssh")) return "ssh";
  if (lowerEventType.includes("secret")) return "secret";
  if (lowerEventType.includes("folder")) return "folder";
  if (lowerEventType.includes("environment")) return "environment";
  if (lowerEventType.includes("project")) return "project";
  if (lowerEventType.includes("integration")) return "integration";
  if (lowerEventType.includes("pam")) return "pam";
  if (lowerEventType.includes("acme")) return "acme";
  if (lowerEventType.includes("kmip")) return "kmip";
  if (lowerEventType.includes("group")) return "group";
  if (lowerEventType.includes("role")) return "role";
  if (lowerEventType.includes("user")) return "user";

  return "general";
};

export { formatActorName };
