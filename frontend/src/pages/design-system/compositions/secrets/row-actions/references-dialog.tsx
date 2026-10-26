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
import { SecretInput } from "@app/components/v4/ui/sensitive-editor";
import { SmallText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { readableValue, type Resource, type Scope, type Secret } from "../../secrets-model";

import styles from "./row-actions.module.css";

type Target = Scope & { key: string };

const referencesIn = (value: string) =>
  [...value.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1].trim());

const resolve = (reference: string, base: Scope): Target => {
  const segments = reference.split(".");
  if (segments.length === 1) return { ...base, key: reference };
  return {
    project: base.project,
    environment: segments[0],
    path: `/${segments.slice(1, -1).join("/")}`,
    key: segments.at(-1) ?? ""
  };
};

const find = (resources: readonly Resource[], target: Target) =>
  resources.find(
    (resource): resource is Secret =>
      resource.kind === "secret" &&
      resource.project === target.project &&
      resource.environment === target.environment &&
      resource.path === target.path &&
      resource.name === target.key
  );

const location = (target: Scope) => `${target.environment} ${target.path}`;

export const dependentsOf = (resources: readonly Resource[], secret: Secret) =>
  resources.filter(
    (resource): resource is Secret =>
      resource.kind === "secret" &&
      resource.id !== secret.id &&
      resource.project === secret.project &&
      referencesIn(readableValue(resource) ?? "").some((reference) => {
        const target = resolve(reference, resource);
        return (
          target.environment === secret.environment &&
          target.path === secret.path &&
          target.key === secret.name
        );
      })
  );

export function ReferencesDialog({
  open,
  secret,
  resources,
  onOpenChange,
  onNavigate
}: {
  open: boolean;
  secret: Secret;
  resources: readonly Resource[];
  onOpenChange: (open: boolean) => void;
  onNavigate: (environment: string, path: string, key: string) => void;
}) {
  let circular = false;
  const expand = (value: string, base: Scope, seen: string[]): string =>
    value.replace(/\$\{([^}]+)\}/g, (raw, reference: string) => {
      const target = resolve(reference.trim(), base);
      const id = `${location(target)} ${target.key}`;
      const found = find(resources, target);
      if (!found || readableValue(found) === undefined) return raw;
      if (seen.includes(id)) {
        circular = true;
        return raw;
      }
      return expand(readableValue(found) ?? "", found, [...seen, id]);
    });
  const nodeFor = (reference: string, base: Scope, seen: string[]): FileTreeNode => {
    const target = resolve(reference, base);
    const id = `${location(target)} ${target.key}`;
    const found = find(resources, target);
    const loops = seen.includes(id);
    const children =
      found && !loops
        ? referencesIn(readableValue(found) ?? "").map((child) =>
            nodeFor(child, found, [...seen, id])
          )
        : [];
    return {
      id: [...seen, id].join(">"),
      name: target.key,
      icon: "key",
      meta: found ? location(target) : `${location(target)} (not found)`,
      disabled: !found,
      ...(children.length ? { children, type: "folder" as const } : { type: "file" as const })
    };
  };
  const self = `${location(secret)} ${secret.name}`;
  const tree = referencesIn(readableValue(secret) ?? "").map((reference) =>
    nodeFor(reference, secret, [self])
  );
  const expanded = expand(readableValue(secret) ?? "", secret, [self]);
  const dependents = dependentsOf(resources, secret);
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
            Visual breakdown of secrets referenced by this secret.
          </DialogDescription>
        </DialogHeader>
        <div className={styles.referenceBody}>
          <Field label="Expanded value">
            <SecretInput value={expanded} label="Expanded value" />
          </Field>
          {circular && (
            <SmallText muted>
              This secret contains circular references. Value shown is resolved once, with circular
              paths truncated in the reference tree below.
            </SmallText>
          )}
          <section className={styles.referenceSection}>
            <h3 className={styles.sectionHead}>
              Reference tree
              <Tooltip
                wrap
                content="Overview of all secrets across your project that this secret references. You can only view references you have access to."
              >
                <span className={styles.hint}>
                  <Icon name="info" size={14} label="About the reference tree" />
                </span>
              </Tooltip>
            </h3>
            <div className={styles.treeFrame}>
              <FileTree
                label="Reference tree"
                items={tree}
                defaultExpanded={tree.map((node) => node.id)}
                selectable="all"
                selected={null}
                onSelect={(id, node) => {
                  if (node.disabled) return;
                  const [environment, path, key] = (id.split(">").at(-1) ?? "").split(" ");
                  go(environment, path, key);
                }}
                empty={
                  <SmallText muted className={styles.center}>
                    This secret does not contain references
                  </SmallText>
                }
              />
            </div>
            <SmallText muted>
              Click a secret key to navigate to it (expand/collapse with the arrow).
            </SmallText>
          </section>
          <section className={styles.referenceSection}>
            <h3 className={styles.sectionHead}>
              Dependency tree
              <Tooltip
                wrap
                content="Overview of all secrets across your project that reference this secret. You can only view references you have access to."
              >
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
                    children: dependents.map((dependent) => ({
                      id: dependent.id,
                      name: dependent.name,
                      icon: "key",
                      meta: location(dependent),
                      type: "file"
                    }))
                  }
                ]}
                defaultExpanded={["root"]}
                selected={null}
                onSelect={(id) => {
                  const dependent = dependents.find((entry) => entry.id === id);
                  if (dependent) go(dependent.environment, dependent.path, dependent.name);
                }}
              />
              {!dependents.length && (
                <SmallText muted className={styles.center}>
                  No other secrets reference this secret
                </SmallText>
              )}
            </div>
            <SmallText muted>
              Shows secrets that depend on this secret. Each level is referenced by the one above
              it.
            </SmallText>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
