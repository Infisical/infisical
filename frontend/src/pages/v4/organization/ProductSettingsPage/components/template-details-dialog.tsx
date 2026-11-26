import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { z } from "zod";

import type { ProjectType } from "@app/hooks/api/projects/types";
import type { TProjectTemplate } from "@app/hooks/api/projectTemplates";
import { slugSchema } from "@app/lib/schemas";

import { readableFailure, saved } from "../../../access/toast";
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
  const completed = useRef(false);
  const [draft, setDraft] = useState({
    name: template?.name ?? "",
    description: template?.description ?? ""
  });
  const guard = useDiscardChangesGuard({
    isDirty:
      draft.name !== (template?.name ?? "") || draft.description !== (template?.description ?? ""),
    onDiscard: () => onOpenChange(false)
  });

  const submit = async () => {
    const result = template
      ? await updateTemplate
          .mutateAsync({
            templateId: template.id,
            name: draft.name,
            description: draft.description
          })
          .catch(readableFailure("Couldn't update template details"))
      : await createTemplate
          .mutateAsync({
            name: draft.name,
            description: draft.description || undefined,
            type: projectType
          })
          .catch(readableFailure("Couldn't create project template"));
    saved(template ? "Template details updated" : `Project template "${result.name}" created`);
    completed.current = true;
    onOpenChange(false);
    onComplete?.(result);
    return true;
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        open
        onOpenChange={(open) => {
          if (open) return;
          if (completed.current) onOpenChange(false);
          else guard.requestDiscard();
        }}
        title={template ? "Edit template details" : "Create project template"}
        completeLabel={template ? "Save" : "Create template"}
        onComplete={submit}
        steps={[
          {
            title: "Details",
            validate: () => {
              const issues = schema.safeParse(draft).error?.flatten().fieldErrors;
              if (!issues) return true;
              return {
                fields: {
                  ...(issues.name?.[0] ? { name: issues.name[0] } : {}),
                  ...(issues.description?.[0] ? { description: issues.description[0] } : {})
                }
              };
            },
            content: (
              <Stack gap={16}>
                <Field
                  label="Name"
                  name="name"
                  description="Lowercase letters, numbers and hyphens."
                >
                  <Input
                    mono
                    placeholder="my-project-template"
                    autoComplete="off"
                    data-1p-ignore
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </Field>
                <Field label="Description" name="description" optional>
                  <Textarea
                    rows={4}
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
                </Field>
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog {...guard.discardDialogProps} />
    </>
  );
};
