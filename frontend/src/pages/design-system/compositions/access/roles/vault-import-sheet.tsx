import { useEffect, useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Textarea } from "@app/components/v4/ui/textarea";
import {
  analyzeVaultPolicy,
  type PolicyBlock,
  type PolicyLine
} from "@app/pages/project/RoleDetailsBySlugPage/components/VaultPolicyAnalyzer.utils";
import {
  parseVaultPolicyToInfisical,
  type VaultMount
} from "@app/pages/project/RoleDetailsBySlugPage/components/VaultPolicyImportModal.utils";

import { useAccess } from "../context";
import { fromFlatRules, type RolePermissions } from "./permissions-model";

import styles from "./roles.module.css";

export const VAULT_CONNECTIONS = [{ id: "vc-prod", name: "vault-prod" }];

const VAULT_NAMESPACES: Record<
  string,
  { mounts: VaultMount[]; policies: { name: string; rules: string }[] }
> = {
  "/": {
    mounts: [
      { path: "secret/", type: "kv", version: "2" },
      { path: "kv-legacy/", type: "kv", version: "1" }
    ],
    policies: [
      {
        name: "payments-read",
        rules: `# Payments service reads production config
path "secret/data/prod/payments/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/prod/payments/*" {
  capabilities = ["list"]
}
`
      },
      {
        name: "ci-deployer",
        rules: `path "secret/data/staging/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "secret/metadata/staging/*" {
  capabilities = ["create", "delete"]
}

path "sys/policies/acl/*" {
  capabilities = ["read"]
}
`
      }
    ]
  },
  platform: {
    mounts: [{ path: "secret/", type: "kv", version: "2" }],
    policies: [
      {
        name: "platform-admin",
        rules: `path "secret/data/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
`
      }
    ]
  }
};

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
  permissions,
  onApply
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permissions: RolePermissions;
  onApply: (permissions: RolePermissions) => void;
}) => {
  const { toast } = useAccess();
  const [connectionId, setConnectionId] = useState<string | undefined>(
    VAULT_CONNECTIONS.length === 1 ? VAULT_CONNECTIONS[0].id : undefined
  );
  const [namespace, setNamespace] = useState<string>();
  const [policy, setPolicy] = useState<string>();
  const [hcl, setHcl] = useState("");
  const [analysis, setAnalysis] = useState<{ blocks: PolicyBlock[]; lines: PolicyLine[] }>();

  const mounts = namespace ? VAULT_NAMESPACES[namespace].mounts : undefined;

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
        <p>This namespace has no KV secret engines configured.</p>
        <p>Policy translation requires KV mounts.</p>
      </div>
    );

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <SheetContent className={styles.vaultSheet}>
        <SheetHeader>
          <SheetTitle>Import from HashiCorp Vault</SheetTitle>
          <SheetDescription>
            Select a policy from your Vault namespace or paste your own HCL policy to translate it
            into Infisical permissions.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className={styles.vaultBody}>
            <Alert tone="info" title="How policy translation works">
              <p>
                Policies are translated by identifying KV secret engine mounts and parsing path
                structures to extract environments and secret paths.
              </p>
              <p>
                <strong>Key assumptions:</strong> The first path segment after the mount is treated
                as the environment (e.g., <code>secret/data/prod/app</code> to env:{" "}
                <code>prod</code>, path: <code>/app</code>). Vault capabilities and wildcards are
                automatically mapped to equivalent Infisical permissions and glob patterns.
              </p>
            </Alert>
            <Field
              label="App connection"
              description="HashiCorp Vault app connections available to you in this project."
            >
              <Select
                label="App connection"
                placeholder="Select app connection..."
                value={connectionId}
                options={VAULT_CONNECTIONS.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(value) => {
                  setConnectionId(value);
                  setNamespace(undefined);
                  setPolicy(undefined);
                  setHcl("");
                }}
              />
            </Field>
            <Field
              label="Namespace"
              description="Select the Vault namespace used to fetch policies and KV mount information for the translation."
            >
              <Select
                label="Namespace"
                placeholder={
                  connectionId ? "Select namespace..." : "Select an app connection first..."
                }
                disabled={!connectionId}
                value={namespace}
                options={Object.keys(VAULT_NAMESPACES).map((name) => ({
                  value: name,
                  label: name === "/" ? "root" : name
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
              description="Select a policy to auto-populate the HCL editor below, or skip to paste your own policy."
            >
              <Select
                label="Select Vault policy"
                placeholder="Choose a policy to import..."
                disabled={!namespace}
                value={policy}
                options={(namespace ? VAULT_NAMESPACES[namespace].policies : []).map((item) => ({
                  value: item.name,
                  label: item.name
                }))}
                onChange={(value) => {
                  setPolicy(value);
                  setHcl(
                    VAULT_NAMESPACES[namespace ?? "/"].policies.find((item) => item.name === value)
                      ?.rules ?? ""
                  );
                }}
              />
            </Field>
            <div className={styles.vaultGrid}>
              <Field
                label="Vault HCL policy"
                description="Paste your HCL policy here or select one from the dropdown above."
              >
                <Textarea
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
