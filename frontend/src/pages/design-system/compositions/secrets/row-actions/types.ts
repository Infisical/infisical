import type { Resource, Secret } from "../../secrets-model";
import type { FlowFeedback, FlowScope } from "../flows";

export type SecretPatch = Partial<
  Pick<
    Secret,
    "comment" | "tags" | "metadata" | "skipMultilineEncoding" | "reminder" | "override" | "versions"
  >
> & { value?: string };

export type SecretUpdate = (secret: Secret, patch: SecretPatch, feedback: FlowFeedback) => void;

type Of<K extends Resource["kind"]> = Extract<Resource, { kind: K }>;

export type RowAction =
  | { kind: "folder"; action: "move" | "access"; entry: Of<"folder">; entries: Of<"folder">[] }
  | { kind: "import"; action: "resync" | "delete"; entry: Of<"import"> }
  | {
      kind: "dynamic";
      action: "leases" | "lease" | "edit" | "delete" | "force-delete";
      entry: Of<"dynamic">;
    }
  | {
      kind: "rotation";
      action: "validate" | "credentials" | "rotate" | "reconcile" | "edit" | "delete";
      entry: Of<"rotation">;
    }
  | { kind: "honey"; action: "details" | "edit" | "revoke"; entry: Of<"honey"> }
  | { kind: "proxy"; action: "edit" | "delete"; entry: Of<"proxy"> };

export type RowActionTone = "ok" | "bad" | "neutral";

export type OverlayHostProps = {
  onClose: () => void;
  scope: FlowScope;
  resources: readonly Resource[];
  onApply: (update: (current: Resource[]) => Resource[], feedback: FlowFeedback) => void;
  onToast: (tone: RowActionTone, feedback: FlowFeedback) => void;
};

export type RowActionHostProps<K extends RowAction["kind"]> = {
  action?: Extract<RowAction, { kind: K }>;
  onClose: () => void;
  scope: FlowScope;
  resources: readonly Resource[];
  onApply: (update: (current: Resource[]) => Resource[], feedback: FlowFeedback) => void;
  onToast: (tone: RowActionTone, feedback: FlowFeedback) => void;
};
