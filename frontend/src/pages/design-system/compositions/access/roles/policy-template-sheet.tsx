import { useMemo, useState } from "react";
import {
  LayoutGridIcon,
  ListIcon,
  type LucideIcon,
  PencilIcon,
  Share2Icon,
  ShieldIcon,
  TagIcon,
  UsersIcon
} from "lucide-react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { POLICY_TEMPLATES, type PolicyTemplate } from "./catalog";
import { type RolePermissions, ruleId } from "./permissions-model";

import styles from "./roles.module.css";

type Glyph = { name: IconName } | { icon: LucideIcon };

const TEMPLATE_ICONS: Record<string, Glyph> = {
  Eye: { name: "eye" },
  Pencil: { icon: PencilIcon },
  Users: { icon: UsersIcon },
  Share2: { icon: Share2Icon },
  Bot: { name: "agent" }
};

const SUBJECT_ICONS: Record<string, Glyph> = {
  secrets: { name: "key" },
  "secret-folders": { name: "folder" },
  "secret-imports": { name: "download" },
  "dynamic-secrets": { name: "clock" },
  "secret-rotation": { name: "sync" },
  "secret-syncs": { name: "sync" },
  "secret-rollback": { name: "history" },
  commits: { name: "git" },
  environments: { name: "globe" },
  tags: { icon: TagIcon },
  integrations: { name: "apps" },
  "honey-tokens": { name: "alert" },
  "proxied-services": { name: "link" },
  "audit-logs": { name: "history" },
  member: { name: "user" },
  groups: { icon: UsersIcon },
  identity: { name: "machine" },
  workspace: { name: "apps" },
  role: { name: "lock" },
  settings: { name: "settings" }
};

const actionGlyph = (label: string, value: string): Glyph => {
  const haystack = `${label} ${value}`.toLowerCase();
  if (/(delete|remove)/.test(haystack)) return { name: "trash" };
  if (/(create|add|issue)/.test(haystack)) return { name: "plus" };
  if (/(edit|modify|update|rename)/.test(haystack)) return { icon: PencilIcon };
  if (/(read|view|describe|list)/.test(haystack)) return { name: "eye" };
  if (/lease/.test(haystack)) return { name: "clock" };
  if (/rotat/.test(haystack)) return { name: "sync" };
  if (/scan/.test(haystack)) return { name: "search" };
  return { icon: ShieldIcon };
};

const Glyph = ({ glyph, size }: { glyph: Glyph; size?: number }) =>
  "name" in glyph ? <Icon name={glyph.name} size={size} /> : <Icon icon={glyph.icon} size={size} />;

const groupsOf = (template: PolicyTemplate) =>
  [...template.permissions].sort((a, b) => a.title.localeCompare(b.title));

const CompactView = ({ template }: { template: PolicyTemplate }) => (
  <div className={styles.compactGroups}>
    {groupsOf(template).map((group) => (
      <div key={group.subject} className={styles.compactGroup}>
        <strong>{group.title}</strong>
        <ul className={styles.compactActions}>
          {group.actions.map((action) => (
            <li key={action.value}>{action.label}</li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

const DetailedView = ({ template }: { template: PolicyTemplate }) => (
  <div className={styles.templateCards}>
    {groupsOf(template).map((group) => (
      <section key={group.subject} className={styles.templateCard}>
        <header className={styles.templateCardHead}>
          <span className={styles.tile}>
            <Glyph glyph={SUBJECT_ICONS[group.subject] ?? { name: "lock" }} size={16} />
          </span>
          <strong>{group.title}</strong>
        </header>
        <ul className={styles.badges}>
          {group.actions.map((action) => {
            const badge = (
              <Badge tone="soft">
                <Glyph glyph={actionGlyph(action.label, action.value)} size={12} />
                {action.label}
              </Badge>
            );
            return (
              <li key={action.value}>
                {action.description ? (
                  <Tooltip content={action.description} wrap>
                    <span className={styles.inlineTrigger}>{badge}</span>
                  </Tooltip>
                ) : (
                  badge
                )}
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
);

export const PolicyTemplateSheet = ({
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
  const [selectedId, setSelectedId] = useState(POLICY_TEMPLATES[0].id);
  const [layout, setLayout] = useState<"compact" | "detailed">("detailed");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const selected =
    POLICY_TEMPLATES.find((template) => template.id === selectedId) ?? POLICY_TEMPLATES[0];
  const count = useMemo(
    () => selected.permissions.reduce((total, group) => total + group.actions.length, 0),
    [selected]
  );

  const apply = (skipConflicting: boolean) => {
    const next = { ...permissions };
    selected.permissions.forEach(({ subject, actions }) => {
      if (skipConflicting && conflicts.includes(subject)) return;
      next[subject] = [
        {
          id: ruleId(),
          actions: actions.map((action) => action.value),
          inverted: false,
          conditions: []
        }
      ];
    });
    onApply(next);
    setConflicts([]);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className={styles.templateSheet}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Policy templates</SheetTitle>
            <SheetDescription>
              Select a template with prepopulated policies to get started. You can always add more
              policies later.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className={styles.templateLayout}>
              <nav aria-label="Policy templates" className={styles.templateNav}>
                {POLICY_TEMPLATES.map((template) => {
                  const active = template.id === selected.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={styles.templateItem}
                      data-active={active || undefined}
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelectedId(template.id)}
                    >
                      <span className={styles.templateItemName}>
                        <Glyph
                          glyph={TEMPLATE_ICONS[template.icon] ?? { name: "lock" }}
                          size={16}
                        />
                        {template.name}
                      </span>
                      <span className={styles.templateItemDescription}>{template.description}</span>
                    </button>
                  );
                })}
              </nav>
              <section aria-label="Template policies" className={styles.templatePanel}>
                <div className={styles.templatePanelHead}>
                  <div className={styles.templatePanelCopy}>
                    <h3 className={styles.templatePanelTitle}>{selected.name}</h3>
                    <p className={styles.muted}>{selected.description}</p>
                    <span>
                      <Badge tone="soft">{`${count} ${count === 1 ? "policy" : "policies"}`}</Badge>
                    </span>
                  </div>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    aria-label="Policy layout"
                    value={layout}
                    onValueChange={(value) => value && setLayout(value as "compact" | "detailed")}
                  >
                    <Tooltip content="List">
                      <ToggleGroupItem value="compact" aria-label="List view">
                        <Icon icon={ListIcon} />
                      </ToggleGroupItem>
                    </Tooltip>
                    <Tooltip content="Cards">
                      <ToggleGroupItem value="detailed" aria-label="Card view">
                        <Icon icon={LayoutGridIcon} />
                      </ToggleGroupItem>
                    </Tooltip>
                  </ToggleGroup>
                </div>
                {layout === "compact" ? (
                  <CompactView template={selected} />
                ) : (
                  <DetailedView template={selected} />
                )}
              </section>
            </div>
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const conflicting = selected.permissions
                    .map((group) => group.subject)
                    .filter((subject) => permissions[subject]?.length);
                  if (conflicting.length) {
                    setConflicts(conflicting);
                    return;
                  }
                  apply(false);
                }}
              >
                Apply template
              </Button>
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Dialog open={conflicts.length > 0} onOpenChange={(next) => !next && setConflicts([])}>
        <DialogContent className={styles.formDialog}>
          <DialogHeader>
            <DialogTitle>Conflicting policies</DialogTitle>
            <DialogDescription>
              The following resources already have policies assigned to them.
            </DialogDescription>
          </DialogHeader>
          <ul className={styles.conflicts}>
            {conflicts.map((subject) => (
              <li key={subject}>
                {selected.permissions.find((group) => group.subject === subject)?.title ?? subject}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => apply(true)}>
              Skip conflicting
            </Button>
            <Button variant="destructive" onClick={() => apply(false)}>
              Overwrite existing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
