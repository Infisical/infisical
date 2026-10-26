import type { Secret } from "../../secrets-model";
import type { FlowFeedback } from "../flows";

export type SecretPatch = Partial<
  Pick<
    Secret,
    "comment" | "tags" | "metadata" | "skipMultilineEncoding" | "reminder" | "override" | "versions"
  >
> & { value?: string };

export type SecretUpdate = (secret: Secret, patch: SecretPatch, feedback: FlowFeedback) => void;
