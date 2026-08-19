import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  ClockIcon,
  EyeIcon,
  LayoutGridIcon,
  ListIcon,
  type LucideIcon,
  PencilIcon,
  PlusIcon,
  RadarIcon,
  RotateCcwIcon,
  ShieldIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  ButtonGroup,
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
  getProjectPermissionSubjectPresentation,
  IconButton,
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

const POLICY_LAYOUT = {
  Compact: "compact",
  Detailed: "detailed"
} as const;

type PolicyLayout = (typeof POLICY_LAYOUT)[keyof typeof POLICY_LAYOUT];

const PolicyGroupsCompactView = ({ groups }: { groups: TemplatePolicyGroup[] }) => (
  <div className="columns-1 gap-x-6 @md/policies:columns-2">
    {groups.map((group) => (
      <div key={group.subject} className="mb-5 break-inside-avoid">
        <div className="text-sm font-medium">{group.title}</div>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-sm text-accent">
          {group.actions.map((action) => (
            <li key={action.value}>{action.label}</li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

const PolicyGroupsDetailedView = ({ groups }: { groups: TemplatePolicyGroup[] }) => (
  <div className="flex flex-col gap-3">
    {groups.map((group) => {
      const { Icon: SubjectIcon, color } = getProjectPermissionSubjectPresentation(group.subject);

      return (
        <Card key={group.subject} className="gap-0 overflow-hidden p-0 shadow-none">
          <CardHeader className="border-b px-3 py-2.5">
            <CardTitle className="gap-2.5 text-sm">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md border",
                  color.tileClassName
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
                const ActionIcon = getPermissionActionIcon(action.label, action.value);
                const badge = (
                  <Badge variant="neutral" iconPosition="left">
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
);

const Content = ({ onClose, type: projectType }: ContentProps) => {
  const rootForm = useFormContext<TFormSchema>();

  const templates = RoleTemplates[projectType ?? ProjectType.SecretManager];
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);
  const [conflictingSubjects, setConflictingSubjects] = useState<ProjectPermissionSub[]>([]);
  const [showConflictingSubjects, setShowConflictingSubjects] = useState(false);
  const [policyLayout, setPolicyLayout] = useState<PolicyLayout>(POLICY_LAYOUT.Detailed);

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
                className="@container/policies min-h-0 thin-scrollbar flex-1 overflow-y-auto p-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <div className="flex flex-col gap-8">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <h3 className="text-lg leading-none font-semibold">
                        {selectedTemplate.name}
                      </h3>
                      <p className="text-sm text-accent">{selectedTemplate.description}</p>
                      <Badge variant="neutral">
                        {selectedPolicyCount} {selectedPolicyCount === 1 ? "Policy" : "Policies"}
                      </Badge>
                    </div>
                    <ButtonGroup aria-label="Policy layout">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton
                            size="sm"
                            variant={policyLayout === POLICY_LAYOUT.Compact ? "project" : "outline"}
                            aria-label="List view"
                            aria-pressed={policyLayout === POLICY_LAYOUT.Compact}
                            className={policyLayout === POLICY_LAYOUT.Compact ? "z-10" : ""}
                            onClick={() => setPolicyLayout(POLICY_LAYOUT.Compact)}
                          >
                            <ListIcon />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>List</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton
                            size="sm"
                            variant={
                              policyLayout === POLICY_LAYOUT.Detailed ? "project" : "outline"
                            }
                            aria-label="Card view"
                            aria-pressed={policyLayout === POLICY_LAYOUT.Detailed}
                            className={policyLayout === POLICY_LAYOUT.Detailed ? "z-10" : ""}
                            onClick={() => setPolicyLayout(POLICY_LAYOUT.Detailed)}
                          >
                            <LayoutGridIcon />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Cards</TooltipContent>
                      </Tooltip>
                    </ButtonGroup>
                  </div>
                  {policyLayout === POLICY_LAYOUT.Compact ? (
                    <PolicyGroupsCompactView groups={selectedPolicyGroups} />
                  ) : (
                    <PolicyGroupsDetailedView groups={selectedPolicyGroups} />
                  )}
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
