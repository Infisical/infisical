import { EyeOffIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { FileTree, type FileTreeNode } from "@app/components/v4/ui/file-tree";
import { Icon } from "@app/components/v4/ui/icon";
import { SecretValue } from "@app/components/v4/ui/sensitive-editor";
import { SmallText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import type {
  TSecretDependencyTreeNode,
  TSecretReferenceTraceNode
} from "@app/hooks/api/secrets/types";

import { useV4Adapter } from "../../../../data/adapters";
import type { Scope, Secret } from "../../secrets-model";

import styles from "./row-actions.module.css";

const location = (target: Pick<Scope, "environment" | "path">) =>
  `${target.environment} ${target.path}`;

export type Dependent = {
  id: string;
  name: string;
  environment: string;
  path: string;
  children: Dependent[];
};

const toDependent = (node: TSecretDependencyTreeNode, parent: string): Dependent => {
  const id = `${parent}>${node.environment} ${node.secretPath} ${node.key}`;
  return {
    id,
    name: node.key,
    environment: node.environment,
    path: node.secretPath,
    children: node.children.map((child) => toDependent(child, id))
  };
};

export const useDependents = (secret: Secret) => {
  const { data } = useV4Adapter("secrets").useSecretReferences({
    projectId: secret.project,
    environment: secret.environment,
    secretPath: secret.path,
    secretKey: secret.name
  });
  return data?.tree.children.map((child) => toDependent(child, "root")) ?? [];
};

const toDependentNode = (dependent: Dependent): FileTreeNode => ({
  id: dependent.id,
  name: dependent.name,
  icon: "key",
  meta: location(dependent),
  ...(dependent.children.length
    ? { children: dependent.children.map(toDependentNode), type: "folder" as const }
    : { type: "file" as const })
});

const lastTarget = (id: string) => (id.split(">").at(-1) ?? "").split(" ");

export function ReferencesDialog({
  open,
  secret,
  onOpenChange,
  onNavigate
}: {
  open: boolean;
  secret: Secret;
  onOpenChange: (open: boolean) => void;
  onNavigate: (environment: string, path: string, key: string) => void;
}) {
  const { data: trace, error } = useV4Adapter("secrets").useSecretReferenceTree({
    projectId: secret.project,
    environmentSlug: secret.environment,
    secretPath: secret.path,
    secretKey: secret.name
  });
  const dependents = useDependents(secret);
  let circular = false;
  const nodeFor = (node: TSecretReferenceTraceNode, seen: string[]): FileTreeNode => {
    const id = `${node.environment} ${node.secretPath} ${node.key}`;
    const loops = seen.includes(id);
    if (loops) circular = true;
    const children = loops ? [] : node.children.map((child) => nodeFor(child, [...seen, id]));
    const target = { environment: node.environment, path: node.secretPath };
    return {
      id: [...seen, id].join(">"),
      name: node.key,
      icon: "key",
      meta:
        node.value || node.children.length ? (
          location(target)
        ) : (
          <span className={styles.nodeMeta}>
            {location(target)}
            <Tooltip content="No value">
              <span className={styles.hint} data-tone="bad">
                <Icon icon={EyeOffIcon} size={14} label="Referenced secret has no value" />
              </span>
            </Tooltip>
          </span>
        ),
      ...(children.length ? { children, type: "folder" as const } : { type: "file" as const })
    };
  };
  const self = `${location(secret)} ${secret.name}`;
  const tree = trace?.tree.children.map((child) => nodeFor(child, [self])) ?? [];
  const forbidden = Boolean(error);
  const expanded = trace?.value ?? "";
  const go = (environment: string, path: string, key: string) => {
    onOpenChange(false);
    onNavigate(environment, path, key);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={styles.referencesDialog}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Secret reference details</DialogTitle>
          <DialogDescription>
            Secrets this one references, and secrets that depend on it.
          </DialogDescription>
        </DialogHeader>
        <div className={styles.referenceBody}>
          <Field label="Expanded value">
            <SecretValue value={forbidden ? "" : expanded} label="Expanded value" />
          </Field>
          {circular && (
            <SmallText muted>
              This secret has circular references. The value is resolved once, and circular paths
              are cut off in the tree below.
            </SmallText>
          )}
          <section className={styles.referenceSection}>
            <h3 className={styles.sectionHead}>
              Reference tree
              <Tooltip content="Secrets this one references. You only see references you have access to.">
                <span className={styles.hint}>
                  <Icon name="info" size={14} label="About the reference tree" />
                </span>
              </Tooltip>
            </h3>
            <div className={styles.treeFrame}>
              {forbidden ? (
                <SmallText role="alert" className={styles.treeError}>
                  <Icon name="alert" size={14} />
                  Error fetching secret reference tree
                </SmallText>
              ) : (
                <FileTree
                  label="Reference tree"
                  items={tree}
                  defaultExpanded={tree.map((node) => node.id)}
                  selectable="all"
                  selected={null}
                  onSelect={(id) => {
                    const [environment, path, key] = lastTarget(id);
                    go(environment, path, key);
                  }}
                  empty={
                    <SmallText muted className={styles.center}>
                      This secret does not contain references
                    </SmallText>
                  }
                />
              )}
            </div>
          </section>
          <section className={styles.referenceSection}>
            <h3 className={styles.sectionHead}>
              Dependency tree
              <Tooltip content="Secrets that reference this one. You only see references you have access to.">
                <span className={styles.hint}>
                  <Icon name="info" size={14} label="About the dependency tree" />
                </span>
              </Tooltip>
            </h3>
            <div className={styles.treeFrame}>
              <FileTree
                label="Dependency tree"
                items={[
                  {
                    id: "root",
                    name: secret.name,
                    icon: "key",
                    meta: location(secret),
                    type: "folder",
                    children: dependents.map(toDependentNode)
                  }
                ]}
                defaultExpanded={["root"]}
                selected={null}
                onSelect={(id) => {
                  if (id === "root") return;
                  const [environment, path, key] = lastTarget(id);
                  go(environment, path, key);
                }}
              />
              {!dependents.length && (
                <SmallText muted className={styles.center}>
                  No other secrets reference this secret
                </SmallText>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
