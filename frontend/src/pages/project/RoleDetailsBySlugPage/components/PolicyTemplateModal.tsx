import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";

import {
  PROJECT_PERMISSION_OBJECT,
  RoleTemplate,
  RoleTemplates,
  TFormSchema
} from "./ProjectRoleModifySection.utils";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  onClose: () => void;
};

const Content = ({ onClose }: ContentProps) => {
  const rootForm = useFormContext<TFormSchema>();

  const [selectedTemplate, setSelectedTemplate] = useState<RoleTemplate>();
  const [conflictingSubjects, setConflictingSubjects] = useState<ProjectPermissionSub[]>([]);
  const [showConflictingSubjects, setShowConflictingSubjects] = useState(false);

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
      <Modal isOpen={showConflictingSubjects} onOpenChange={setShowConflictingSubjects}>
        <ModalContent
          title="Conflicting Policies"
          subTitle="The following resources already have policies assigned to them."
        >
          <div className="grid grid-cols-2 gap-2 text-sm">
            {conflictingSubjects.map((subject) => (
              <div key={subject}>
                <span className="text-mineshaft-200">
                  {PROJECT_PERMISSION_OBJECT[subject].title}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-8 flex space-x-4">
            <ModalClose asChild>
              <Button colorSchema="danger" onClick={() => onSubmit()}>
                Overwrite Existing
              </Button>
            </ModalClose>
            <ModalClose asChild>
              <Button colorSchema="secondary" onClick={() => onSubmit(true)}>
                Skip Conflicting
              </Button>
            </ModalClose>
          </div>
        </ModalContent>
      </Modal>
      <Accordion
        type="single"
        value={selectedTemplate?.id}
        onValueChange={(value) =>
          setSelectedTemplate(RoleTemplates.find((template) => template.id === value))
        }
        collapsible
        className="w-full border-collapse"
      >
        {RoleTemplates.map(({ name, description, permissions, id }) => (
          <AccordionItem
            key={id}
            value={id}
            className="m-0 border border-mineshaft-600 first:rounded-t last:rounded-b data-[state=open]:border-primary/40 data-[state=open]:bg-mineshaft-600/30"
          >
            <AccordionTrigger className="w-full justify-start p-4 py-8 text-mineshaft-100 hover:bg-mineshaft-700 hover:text-mineshaft-100 data-[state=open]:bg-primary/[3%] data-[state=open]:text-mineshaft-100">
              <div className="mr-auto flex flex-col py-2 text-left">
                <span>{name}</span>
                <span className="text-sm leading-3 text-mineshaft-400">{description}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="border-t border-mineshaft-600">
              <div className="thin-scrollbar max-h-[20rem] overflow-y-auto">
                <span className="text-mineshaft-300">Grants the following permissions:</span>
                <div className="grid grid-cols-2 gap-4 py-2">
                  {permissions
                    .map((permission) => ({
                      ...permission,
                      object: PROJECT_PERMISSION_OBJECT[permission.subject]
                    }))
                    .sort((a, b) => a.object.title.localeCompare(b.object.title))
                    .map(({ subject, actions, object }) => {
                      return (
                        <div key={subject}>
                          <span className="text-mineshaft-200">{object.title}</span>
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
      <div className="mt-8 flex space-x-4">
        <Button isDisabled={!selectedTemplate} onClick={onApply}>
          Apply Template
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </>
  );
};

export const PolicyTemplateModal = ({ isOpen, onOpenChange }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Policy Templates"
        subTitle="Select a template with prepopulated policies to get started. You can always add more policies later."
        className="max-w-3xl"
      >
        <Content onClose={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
