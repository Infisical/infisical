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
      <Accordion
        type="single"
        value={selectedTemplate?.id}
        onValueChange={(value) =>
          setSelectedTemplate(templates.find((template) => template.id === value))
        }
        collapsible
        className="w-full"
      >
        {templates.map(({ name, description, permissions, id }) => (
          <AccordionItem key={id} value={id}>
            <AccordionTrigger className="py-3">
              <div className="mr-auto flex flex-col gap-1 text-left">
                <span>{name}</span>
                <span className="text-sm font-normal text-muted">{description}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="border-t border-border">
              <div className="max-h-80 thin-scrollbar overflow-y-auto">
                <span className="text-muted">Grants the following permissions:</span>
                <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
                  {permissions
                    .map((permission) => ({
                      ...permission,
                      object: PROJECT_PERMISSION_OBJECT[permission.subject]
                    }))
                    .sort((a, b) => a.object.title.localeCompare(b.object.title))
                    .map(({ subject, actions, object }) => {
                      return (
                        <div key={subject}>
                          <span className="text-foreground">{object.title}</span>
                          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                            {actions.map((action) => (
                              <li key={action}>
                                {object.actions.find((a) => a.value === action)?.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
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

export const PolicyTemplateModal = ({ isOpen, onOpenChange, type }: Props) => {
  return (
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
};
