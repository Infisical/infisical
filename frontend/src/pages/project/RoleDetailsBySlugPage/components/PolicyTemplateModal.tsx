import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  BellIcon,
  ClockIcon,
  DatabaseIcon,
  EyeIcon,
  FileCheckIcon,
  FileKeyIcon,
  FileStackIcon,
  FingerprintIcon,
  FolderArchiveIcon,
  FolderIcon,
  ImportIcon,
  KeyRoundIcon,
  LayersIcon,
  LockIcon,
  type LucideIcon,
  PencilIcon,
  PlusIcon,
  PuzzleIcon,
  RadarIcon,
  RotateCcwIcon,
  ScrollTextIcon,
  SearchIcon,
  ServerIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  TableIcon,
  TagIcon,
  Trash2Icon,
  UndoIcon,
  UsersIcon,
  WaypointsIcon,
  WebhookIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { ProjectPermissionSub } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import {
  PROJECT_PERMISSION_OBJECT,
  RoleTemplate,
  RoleTemplates,
  TFormSchema
} from "./ProjectRoleModifySection.utils";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  type: ProjectType;
};

type ContentProps = {
  onClose: () => void;
  type: ProjectType;
};

type TemplatePolicyGroup = {
  subject: ProjectPermissionSub;
  title: string;
  actions: { value: string; label: string; description?: string }[];
};

const ACCENT_ICON_TILE = "border-accent/10 bg-accent/15 text-accent";

const POLICY_SUBJECT_ICONS: Partial<
  Record<ProjectPermissionSub, { Icon: LucideIcon; tileClassName: string }>
> = {
  [ProjectPermissionSub.Secrets]: {
    Icon: KeyRoundIcon,
    tileClassName: "border-secret/10 bg-secret/15 text-secret"
  },
  [ProjectPermissionSub.SecretFolders]: {
    Icon: FolderIcon,
    tileClassName: "border-folder/10 bg-folder/15 text-folder"
  },
  [ProjectPermissionSub.DynamicSecrets]: {
    Icon: FingerprintIcon,
    tileClassName: "border-dynamic-secret/10 bg-dynamic-secret/15 text-dynamic-secret"
  },
  [ProjectPermissionSub.SecretImports]: {
    Icon: ImportIcon,
    tileClassName: "border-import/10 bg-import/15 text-import"
  },
  [ProjectPermissionSub.SecretRotation]: {
    Icon: RotateCcwIcon,
    tileClassName: "border-secret-rotation/10 bg-secret-rotation/15 text-secret-rotation"
  },
  [ProjectPermissionSub.ProxiedServices]: {
    Icon: WaypointsIcon,
    tileClassName: "border-proxied-service/10 bg-proxied-service/15 text-proxied-service"
  },
  [ProjectPermissionSub.SecretRollback]: { Icon: UndoIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.SecretApproval]: { Icon: FileCheckIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.SecretSyncs]: { Icon: RotateCcwIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Environments]: { Icon: LayersIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Tags]: { Icon: TagIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Integrations]: { Icon: PuzzleIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Webhooks]: { Icon: WebhookIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.ServiceTokens]: { Icon: KeyRoundIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.AuditLogs]: { Icon: ScrollTextIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.IpAllowList]: { Icon: ShieldCheckIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Member]: { Icon: UsersIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Groups]: { Icon: UsersIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Identity]: { Icon: FingerprintIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Role]: { Icon: ShieldIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Project]: { Icon: ShieldIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Settings]: { Icon: SettingsIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Kms]: { Icon: LockIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Cmek]: { Icon: LockIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Kmip]: { Icon: ServerIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Certificates]: { Icon: FileKeyIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.CertificateAuthorities]: {
    Icon: FileKeyIcon,
    tileClassName: ACCENT_ICON_TILE
  },
  [ProjectPermissionSub.CertificateTemplates]: {
    Icon: FileStackIcon,
    tileClassName: ACCENT_ICON_TILE
  },
  [ProjectPermissionSub.CertificateProfiles]: {
    Icon: FileStackIcon,
    tileClassName: ACCENT_ICON_TILE
  },
  [ProjectPermissionSub.CertificateInventoryViews]: {
    Icon: TableIcon,
    tileClassName: ACCENT_ICON_TILE
  },
  [ProjectPermissionSub.PkiAlerts]: { Icon: BellIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.PkiCollections]: {
    Icon: FolderArchiveIcon,
    tileClassName: ACCENT_ICON_TILE
  },
  [ProjectPermissionSub.PkiSyncs]: { Icon: RotateCcwIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.SecretScanningDataSources]: {
    Icon: DatabaseIcon,
    tileClassName: ACCENT_ICON_TILE
  },
  [ProjectPermissionSub.SecretScanningFindings]: {
    Icon: SearchIcon,
    tileClassName: ACCENT_ICON_TILE
  },
  [ProjectPermissionSub.SecretScanningConfigs]: {
    Icon: SlidersHorizontalIcon,
    tileClassName: ACCENT_ICON_TILE
  },
  [ProjectPermissionSub.HoneyTokens]: { Icon: ShieldIcon, tileClassName: ACCENT_ICON_TILE },
  [ProjectPermissionSub.Commits]: { Icon: FileStackIcon, tileClassName: ACCENT_ICON_TILE }
};

const getPolicySubjectIcon = (subject: ProjectPermissionSub) =>
  POLICY_SUBJECT_ICONS[subject] ?? { Icon: ShieldIcon, tileClassName: ACCENT_ICON_TILE };

const getPermissionActionIcon = (label: string, value: string): LucideIcon => {
  const haystack = `${label} ${value}`.toLowerCase();

  if (/(delete|remove)/.test(haystack)) return Trash2Icon;
  if (/(create|add|issue)/.test(haystack)) return PlusIcon;
  if (/(edit|modify|update|rename)/.test(haystack)) return PencilIcon;
  if (/(read|view|describe|list)/.test(haystack)) return EyeIcon;
  if (/lease/.test(haystack)) return ClockIcon;
  if (/rotat/.test(haystack)) return RotateCcwIcon;
  if (/scan/.test(haystack)) return RadarIcon;

  return ShieldIcon;
};

const getTemplatePolicyGroups = (template: RoleTemplate): TemplatePolicyGroup[] =>
  template.permissions
    .map(({ subject, actions }) => {
      const object = PROJECT_PERMISSION_OBJECT[subject];

      return {
        subject,
        title: object.title,
        actions: actions.map((action) => {
          const entry = object.actions.find((item) => item.value === action);

          return {
            value: String(action),
            label: entry?.label ?? String(action),
            description: entry?.description
          };
        })
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

const Content = ({ onClose, type: projectType }: ContentProps) => {
  const rootForm = useFormContext<TFormSchema>();

  const templates = RoleTemplates[projectType ?? ProjectType.SecretManager];
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);
  const [conflictingSubjects, setConflictingSubjects] = useState<ProjectPermissionSub[]>([]);
  const [showConflictingSubjects, setShowConflictingSubjects] = useState(false);

  const selectedPolicyGroups = useMemo(
    () => (selectedTemplate ? getTemplatePolicyGroups(selectedTemplate) : []),
    [selectedTemplate]
  );
  const selectedPolicyCount = selectedPolicyGroups.reduce(
    (count, group) => count + group.actions.length,
    0
  );

  const onSubmit = (skipConflicting = false) => {
    if (!selectedTemplate) {
      createNotification({ type: "error", text: "Please select a template" });
      return;
    }

    selectedTemplate.permissions.forEach(({ subject, actions }) => {
      if (skipConflicting && conflictingSubjects.includes(subject)) return;

      rootForm.setValue(
        `permissions.${subject}`,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-error akhilmhdh: this is because of ts collision with both
        [Object.fromEntries(actions.map((action) => [action, true]))],
        {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true
        }
      );
    });

    onClose();
  };

  const onApply = () => {
    if (!selectedTemplate) {
      createNotification({ type: "error", text: "Please select a template" });
      return;
    }

    const conflictingPolicies: ProjectPermissionSub[] = [];

    selectedTemplate.permissions.forEach(({ subject }) => {
      const rootPolicyValue = rootForm.getValues("permissions")?.[subject];

      if (rootPolicyValue?.length) {
        conflictingPolicies.push(subject);
      }
    });

    if (conflictingPolicies.length) {
      setConflictingSubjects(conflictingPolicies);
      setShowConflictingSubjects(true);
      return;
    }

    onSubmit();
  };

  return (
    <>
      <Dialog open={showConflictingSubjects} onOpenChange={setShowConflictingSubjects}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conflicting Policies</DialogTitle>
            <DialogDescription>
              The following resources already have policies assigned to them.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {conflictingSubjects.map((subject) => (
              <div key={subject}>{PROJECT_PERMISSION_OBJECT[subject].title}</div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onSubmit(true)}>
              Skip Conflicting
            </Button>
            <Button variant="danger" onClick={() => onSubmit()}>
              Overwrite Existing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="@container flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col @md:flex-row">
          <nav
            aria-label="Policy templates"
            className="max-h-48 min-h-0 thin-scrollbar min-w-0 overflow-y-auto border-b border-border @md:max-h-none @md:w-86 @md:max-w-86 @md:border-r @md:border-b-0"
          >
            <div className="flex flex-col">
              {templates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;
                const Icon = template.icon;

                return (
                  <button
                    key={template.id}
                    type="button"
                    data-active={isSelected || undefined}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => setSelectedTemplate(template)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-1 border-b border-l-2 border-border border-l-transparent px-4 py-3 text-left last:border-b-0",
                      "text-sm transition-colors outline-none",
                      "hover:bg-container-hover",
                      "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                      "data-active:border-l-project data-active:bg-foreground/5 data-active:hover:bg-foreground/5"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-4">
                      <Icon
                        aria-hidden="true"
                        className={cn("size-4 shrink-0 text-muted", isSelected && "text-project")}
                      />
                      <span
                        className={cn(
                          "min-w-0 font-semibold text-foreground",
                          isSelected && "text-project"
                        )}
                      >
                        {template.name}
                      </span>
                    </span>
                    <span className="pl-8 text-sm font-normal text-accent">
                      {template.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
          <section
            aria-label="Template policies"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden @md:min-w-80"
          >
            {selectedTemplate && (
              <div
                // Scroll regions must be keyboard reachable when children are informational.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                className="min-h-0 thin-scrollbar flex-1 overflow-y-auto p-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <div className="flex flex-col gap-8">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-lg leading-none font-semibold">{selectedTemplate.name}</h3>
                    <p className="text-sm text-accent">{selectedTemplate.description}</p>
                    <Badge variant="neutral">
                      {selectedPolicyCount} {selectedPolicyCount === 1 ? "Policy" : "Policies"}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-3">
                    {selectedPolicyGroups.map((group) => {
                      const { Icon: SubjectIcon, tileClassName } = getPolicySubjectIcon(
                        group.subject
                      );

                      return (
                        <Card key={group.subject} className="gap-0 overflow-hidden p-0 shadow-none">
                          <CardHeader className="border-b px-3 py-2.5">
                            <CardTitle className="gap-2.5 text-sm">
                              <span
                                className={cn(
                                  "flex size-7 shrink-0 items-center justify-center rounded-md border",
                                  tileClassName
                                )}
                              >
                                <SubjectIcon className="size-4" />
                              </span>
                              {group.title}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-3 py-3">
                            <ul className="flex flex-wrap gap-2">
                              {group.actions.map((action) => {
                                const ActionIcon = getPermissionActionIcon(
                                  action.label,
                                  action.value
                                );
                                const badge = (
                                  <Badge variant="project" iconPosition="left">
                                    <ActionIcon />
                                    {action.label}
                                  </Badge>
                                );

                                return (
                                  <li key={action.value}>
                                    {action.description ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span>{badge}</span>
                                        </TooltipTrigger>
                                        <TooltipContent>{action.description}</TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      badge
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
      <SheetFooter className="justify-end border-t">
        <SheetClose asChild>
          <Button variant="ghost">Cancel</Button>
        </SheetClose>
        <Button variant="project" isDisabled={!selectedTemplate} onClick={onApply}>
          Apply Template
        </Button>
      </SheetFooter>
    </>
  );
};

export const PolicyTemplateModal = ({ isOpen, onOpenChange, type }: Props) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col p-0 sm:max-w-4xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="pr-12">
          <SheetTitle>Policy Templates</SheetTitle>
          <SheetDescription>
            Select a template with prepopulated policies to get started. You can always add more
            policies later.
          </SheetDescription>
        </SheetHeader>
        <Content onClose={() => onOpenChange(false)} type={type} />
      </SheetContent>
    </Sheet>
  );
};
