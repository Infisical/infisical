import { useState } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, SaveIcon, ShieldCheckIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  UnstableAccordion,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger
} from "@app/components/v3";

import {
  DEFAULT_STATIC_SECRET_RULE,
  secretEnforcementFormSchema,
  TSecretEnforcementForm
} from "./SecretEnforcementTab.utils";
import { StaticSecretRuleCard } from "./StaticSecretRuleCard";

export const SecretEnforcementTab = () => {
  const [openSections, setOpenSections] = useState<string[]>([]);

  const form = useForm<TSecretEnforcementForm>({
    resolver: zodResolver(secretEnforcementFormSchema),
    defaultValues: {
      staticSecrets: []
    }
  });

  const {
    handleSubmit,
    formState: { isDirty, isSubmitting },
    reset,
    control
  } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "staticSecrets"
  });

  const onSubmit = (data: TSecretEnforcementForm) => {
    // eslint-disable-next-line no-console
    console.log("Secret enforcement policies:", data);
    createNotification({
      text: "Secret enforcement policies saved (no backend yet)",
      type: "success"
    });
    reset(data);
  };

  const handleAddRule = (e: React.MouseEvent) => {
    e.stopPropagation();
    append(DEFAULT_STATIC_SECRET_RULE);
    if (!openSections.includes("static-secrets")) {
      setOpenSections((prev) => [...prev, "static-secrets"]);
    }
  };

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex h-full w-full flex-1 flex-col rounded-lg border border-border bg-card py-4"
      >
        <FormProvider {...form}>
          <div className="mx-4 flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-lg font-medium text-foreground">Secret Enforcement</h3>
              <p className="text-sm leading-3 text-muted">
                Configure enforcement policies for secret values and keys
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isDirty && (
                <Button
                  type="button"
                  className="mr-4 text-muted"
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={() => reset()}
                >
                  Discard
                </Button>
              )}
              <Button variant="project" type="submit" disabled={isSubmitting || !isDirty}>
                <SaveIcon className="size-4" />
                Save
              </Button>
              <div className="ml-2 border-l border-border pl-4">
                <Button type="button" variant="outline" size="xs" onClick={handleAddRule}>
                  <PlusIcon className="size-4" />
                  Add Policy
                </Button>
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden px-4">
            <div className="thin-scrollbar flex-1 overflow-y-scroll py-4">
              {fields.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-12">
                  <ShieldCheckIcon className="mb-3 size-10 text-muted" />
                  <p className="text-sm text-muted">No enforcement policies configured</p>
                  <p className="mt-1 text-xs text-muted">
                    Click &quot;Add Policy&quot; to create your first secret enforcement rule.
                  </p>
                </div>
              ) : (
                <UnstableAccordion
                  type="multiple"
                  value={openSections}
                  onValueChange={setOpenSections}
                  className="overflow-clip rounded-md border border-border bg-container hover:bg-container-hover"
                >
                  <UnstableAccordionItem value="static-secrets">
                    <UnstableAccordionTrigger className="min-h-14 px-4 py-2.5 hover:bg-container-hover [&>svg]:size-5">
                      <div className="flex flex-1 items-center gap-2 text-left">
                        <div className="flex grow flex-col">
                          <span className="text-base select-none">Static Secrets</span>
                          <span className="text-sm text-muted">
                            Enforce requirements on static secret values and keys
                          </span>
                        </div>
                        {fields.length > 0 && (
                          <Badge variant="neutral" className="mr-2">
                            {fields.length} {fields.length === 1 ? "Rule" : "Rules"}
                          </Badge>
                        )}
                        {openSections.includes("static-secrets") && (
                          <Button type="button" variant="outline" size="xs" onClick={handleAddRule}>
                            <PlusIcon className="size-4" />
                            Add Rule
                          </Button>
                        )}
                      </div>
                    </UnstableAccordionTrigger>
                    <UnstableAccordionContent className="!p-0">
                      <div className="flex flex-col space-y-3 bg-container p-3">
                        {fields.map((field, idx) => (
                          <StaticSecretRuleCard
                            key={field.id}
                            index={idx}
                            onRemove={() => remove(idx)}
                          />
                        ))}
                      </div>
                    </UnstableAccordionContent>
                  </UnstableAccordionItem>
                </UnstableAccordion>
              )}
            </div>
          </div>
        </FormProvider>
      </form>
    </div>
  );
};
