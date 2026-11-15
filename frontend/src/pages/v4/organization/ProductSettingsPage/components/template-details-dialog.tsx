import { useId, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { z } from "zod";

import type { ProjectType } from "@app/hooks/api/projects/types";
import type { TProjectTemplate } from "@app/hooks/api/projectTemplates";
import { slugSchema } from "@app/lib/schemas";

import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";

const schema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().max(500, "Description must be 500 characters or fewer")
});

export const TemplateDetailsDialog = ({
  projectType,
  template,
  onOpenChange,
  onComplete
}: {
  projectType: ProjectType;
  template?: TProjectTemplate;
  onOpenChange: (open: boolean) => void;
  onComplete?: (template: TProjectTemplate) => void;
}) => {
  const productSettings = useV4Adapter("productSettings");
  const createTemplate = productSettings.useCreateProjectTemplate();
  const updateTemplate = productSettings.useUpdateProjectTemplate();
  const formId = useId();
  const [draft, setDraft] = useState({
    name: template?.name ?? "",
    description: template?.description ?? ""
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const issues = submitted ? schema.safeParse(draft).error?.flatten().fieldErrors : undefined;

  const submit = async () => {
    setSubmitted(true);
    if (!schema.safeParse(draft).success) return;
    setPending(true);
    try {
      const result = template
        ? await updateTemplate.mutateAsync({
            templateId: template.id,
            name: draft.name,
            description: draft.description
          })
        : await createTemplate.mutateAsync({
            name: draft.name,
            description: draft.description || undefined,
            type: projectType
          });
      saved(template ? "Template details updated" : `Project template "${result.name}" created`);
      onOpenChange(false);
      onComplete?.(result);
    } catch (error) {
      failed(
        template ? "Failed to update template details" : "Failed to create project template",
        error
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>
            {template ? "Edit template details" : "Create project template"}
          </DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field
              label="Name"
              description="Lowercase letters, numbers and hyphens."
              error={issues?.name?.[0]}
            >
              <Input
                mono
                placeholder="my-project-template"
                data-1p-ignore
                invalid={Boolean(issues?.name)}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label="Description" optional error={issues?.description?.[0]}>
              <Textarea
                rows={4}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={formId} variant="primary" loading={pending}>
            {template ? "Save" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
