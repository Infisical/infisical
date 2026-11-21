import { useEffect, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Textarea } from "@infisical/cipher/ui/textarea";

import {
  analyzeVaultPolicy,
  type PolicyBlock,
  type PolicyLine
} from "@app/pages/project/RoleDetailsBySlugPage/components/VaultPolicyAnalyzer.utils";
import { parseVaultPolicyToInfisical } from "@app/pages/project/RoleDetailsBySlugPage/components/VaultPolicyImportModal.utils";

import { useV4Adapter } from "../../data/adapters";
import { toast } from "../toast";
import { fromFlatRules, type RolePermissions } from "./permissions-model";

import styles from "./roles.module.css";

const PLACEHOLDER = `path "secret/data/prod/app/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "secret/metadata/prod/*" {
  capabilities = ["list"]
}`;

const VaultPolicyPreview = ({ blocks, lines }: { blocks: PolicyBlock[]; lines: PolicyLine[] }) => {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  return (
    <div className={styles.preview} data-scroll-fade="y">
      {lines.map((line) => {
        const block = line.belongsToBlock ? blockMap.get(line.belongsToBlock) : undefined;
        const inBlock = line.type === "part-of-block" && block;
        let tone: "ok" | "bad" | undefined;
        if (inBlock) tone = block.canTranslate ? "ok" : "bad";
        const showIndicator = inBlock && line.lineNumber === block.startLine;
        return (
          <div key={line.id}>
            {showIndicator && (
              <div className={styles.previewIndicator} data-tone={tone}>
                <Icon name={block.canTranslate ? "check-c" : "alert-c"} size={12} />
                {block.canTranslate ? "Can translate" : block.reason || "Cannot translate"}
              </div>
            )}
            <div
              className={styles.previewLine}
              data-tone={tone}
              data-comment={line.type === "comment" || undefined}
            >
              {line.text || " "}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const VaultImportSheet = ({
  open,
  onOpenChange,
  connections,
  permissions,
  onApply
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: readonly { id: string; name: string }[];
  permissions: RolePermissions;
  onApply: (permissions: RolePermissions) => void;
}) => {
  const access = useV4Adapter("access");
  const [connectionId, setConnectionId] = useState<string | undefined>(
    connections.length === 1 ? connections[0].id : undefined
  );
  const [namespace, setNamespace] = useState<string>();
  const [policy, setPolicy] = useState<string>();
  const [hcl, setHcl] = useState("");
  const [analysis, setAnalysis] = useState<{ blocks: PolicyBlock[]; lines: PolicyLine[] }>();

  const { data: namespaces } = access.useVaultNamespaces(connectionId);
  const { data: policies } = access.useVaultPolicies(Boolean(namespace), namespace, connectionId);
  const { data: mounts } = access.useVaultMounts(Boolean(namespace), namespace, connectionId);

  useEffect(() => {
    if (!hcl.trim() || !mounts?.length) {
      setAnalysis(undefined);
      return undefined;
    }
    const timeout = window.setTimeout(() => setAnalysis(analyzeVaultPolicy(hcl, mounts)), 300);
    return () => window.clearTimeout(timeout);
  }, [hcl, mounts]);

  const close = () => {
    setNamespace(undefined);
    setPolicy(undefined);
    setHcl("");
    onOpenChange(false);
  };

  const translate = () => {
    if (!hcl.trim()) {
      toast({ tone: "bad", title: "Please provide a Vault HCL policy" });
      return;
    }
    if (!connectionId) {
      toast({ tone: "bad", title: "Please select an app connection" });
      return;
    }
    if (!mounts?.length) {
      toast({
        tone: "bad",
        title: "No Vault mounts found. Please ensure you have KV secret engines configured."
      });
      return;
    }
    const parsed = parseVaultPolicyToInfisical(hcl, mounts) as Record<
      string,
      Record<string, unknown>[] | undefined
    >;
    const subjects = Object.entries(parsed).filter(([, rules]) => rules?.length);
    if (!subjects.length) {
      toast({
        tone: "neutral",
        title:
          "No translatable permissions found in the policy. Ensure the policy contains KV secret paths (e.g., secret/data/*, secret/metadata/*)."
      });
      return;
    }
    const next = { ...permissions };
    subjects.forEach(([subject, rules]) => {
      next[subject] = [...(next[subject] ?? []), ...fromFlatRules(rules ?? [])];
    });
    onApply(next);
    toast({ tone: "neutral", title: "Vault policy translated and prefilled" });
    close();
  };

  let emptyPreview = <p>Enter a policy to see translation preview</p>;
  if (!namespace) emptyPreview = <p>Select a namespace to enable preview</p>;
  else if (!mounts?.length)
    emptyPreview = (
      <div>
        <p className={styles.warningText}>No KV mounts found</p>
        <p>Policy translation requires KV mounts.</p>
      </div>
    );

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <SheetContent className={styles.vaultSheet}>
        <SheetHeader>
          <SheetTitle>Import from HashiCorp Vault</SheetTitle>
          <SheetDescription>
            Translate a Vault HCL policy into Infisical permissions.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className={styles.vaultBody}>
            <Alert tone="info" title="How policy translation works">
              <p>
                Only KV mounts are translated. The first path segment after the mount becomes the
                environment (<code>secret/data/prod/app</code> becomes env <code>prod</code>, path{" "}
                <code>/app</code>). Capabilities and wildcards map to Infisical permissions and glob
                patterns.
              </p>
            </Alert>
            <Field label="App connection">
              <Select
                label="App connection"
                placeholder="Select app connection..."
                value={connectionId}
                options={connections.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(value) => {
                  setConnectionId(value);
                  setNamespace(undefined);
                  setPolicy(undefined);
                  setHcl("");
                }}
              />
            </Field>
            <Field label="Namespace">
              <Select
                label="Namespace"
                placeholder={
                  connectionId ? "Select namespace..." : "Select an app connection first..."
                }
                disabled={!connectionId}
                value={namespace}
                options={(namespaces ?? []).map((item) => ({
                  value: item.name,
                  label: item.name === "/" ? "root" : item.name
                }))}
                onChange={(value) => {
                  setNamespace(value);
                  setPolicy(undefined);
                }}
              />
            </Field>
            <Field
              label="Select Vault policy"
              optional
              description="Fills the HCL editor below. Skip to paste your own."
            >
              <Select
                label="Select Vault policy"
                placeholder="Choose a policy to import..."
                disabled={!namespace}
                value={policy}
                options={(policies ?? []).map((item) => ({
                  value: item.name,
                  label: item.name
                }))}
                onChange={(value) => {
                  setPolicy(value);
                  setHcl(policies?.find((item) => item.name === value)?.rules ?? "");
                }}
              />
            </Field>
            <div className={styles.vaultGrid}>
              <Field label="Vault HCL policy">
                <Textarea
                  mono
                  id="vault-hcl-policy"
                  rows={16}
                  value={hcl}
                  placeholder={PLACEHOLDER}
                  spellCheck={false}
                  onChange={(event) => setHcl(event.target.value)}
                />
              </Field>
              <div className={styles.previewField}>
                <span className={styles.previewLabel}>Translation preview</span>
                {analysis ? (
                  <VaultPolicyPreview blocks={analysis.blocks} lines={analysis.lines} />
                ) : (
                  <div className={styles.previewEmpty}>{emptyPreview}</div>
                )}
              </div>
            </div>
          </div>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!hcl.trim() || !mounts} onClick={translate}>
              Translate & apply
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
