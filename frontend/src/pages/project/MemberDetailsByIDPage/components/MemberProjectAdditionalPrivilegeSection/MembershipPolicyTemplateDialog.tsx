import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  PROJECT_PERMISSION_OBJECT,
  RoleTemplate,
  RoleTemplates,
  TFormSchema
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  type: ProjectType;
};

type ContentProps = {
  onClose: () => void;
  type: ProjectType;
};

const Content = ({ onClose, type: projectType }: ContentProps) => {
  const rootForm = useFormContext<TFormSchema>();
  const [selectedTemplate, setSelectedTemplate] = useState<RoleTemplate>();
  const [conflictingSubjects, setConflictingSubjects] = useState<ProjectPermissionSub[]>([]);
  const [showConflictingSubjects, setShowConflictingSubjects] = useState(false);

  const templates = RoleTemplates[projectType ?? ProjectType.SecretManager];

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

    setShowConflictingSubjects(false);
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

      if (rootPolicyValue?.length) conflictingPolicies.push(subject);
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Conflicting Policies</DialogTitle>
            <DialogDescription>
              The following resources already have policies assigned to them.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-wrap gap-2 text-sm">
              {conflictingSubjects.map((subject) => (
                <div key={subject} className="min-w-0 grow basis-48 text-foreground">
                  {PROJECT_PERMISSION_OBJECT[subject].title}
                </div>
              ))}
            </div>
          </DialogBody>
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

      <DialogBody>
        <Accordion
          type="single"
          value={selectedTemplate?.id}
          onValueChange={(value) =>
            setSelectedTemplate(templates.find((template) => template.id === value))
          }
          collapsible
        >
          {templates.map(({ name, description, permissions, id }) => (
            <AccordionItem key={id} value={id}>
              <AccordionTrigger>
                <div className="flex min-w-0 flex-col gap-1 py-3">
                  <span>{name}</span>
                  <span className="text-xs font-normal text-muted">{description}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-6">
                <p className="mb-3 text-sm text-muted">Grants the following permissions:</p>
                <div className="flex flex-wrap gap-4">
                  {permissions
                    .map((permission) => ({
                      ...permission,
                      object: PROJECT_PERMISSION_OBJECT[permission.subject]
                    }))
                    .sort((a, b) => a.object.title.localeCompare(b.object.title))
                    .map(({ subject, actions, object }) => (
                      <div key={subject} className="min-w-0 grow basis-56">
                        <span className="text-sm font-medium text-foreground">{object.title}</span>
                        <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-sm text-muted">
                          {actions.map((action) => (
                            <li key={action}>
                              {object.actions.find((item) => item.value === action)?.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button variant="project" isDisabled={!selectedTemplate} onClick={onApply}>
          Apply Template
        </Button>
      </DialogFooter>
    </>
  );
};

export const MembershipPolicyTemplateDialog = ({ isOpen, onOpenChange, type }: Props) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Policy Templates</DialogTitle>
        <DialogDescription>
          Select a template with prepopulated policies to get started. You can always add more
          policies later.
        </DialogDescription>
      </DialogHeader>
      <Content onClose={() => onOpenChange(false)} type={type} />
    </DialogContent>
  </Dialog>
);
