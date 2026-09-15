import { useMemo } from "react";
import { InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { AlertDescription, AlertTitle, DismissableAlert } from "@app/components/v3";
import { useCreatePamAccountTemplate } from "@app/hooks/api/pam";
import type {
  TPamAccountTemplateWithCount,
  TPamAccountTypeMetadata
} from "@app/hooks/api/pam/types";

type Props = {
  templates?: TPamAccountTemplateWithCount[];
  accountTypes: TPamAccountTypeMetadata[];
};

export const MissingTemplatesCallout = ({ templates, accountTypes }: Props) => {
  const createTemplate = useCreatePamAccountTemplate();

  const missing = useMemo(() => {
    if (!templates) return [];
    const covered = new Set(templates.map((template) => template.type));
    return accountTypes.filter((meta) => !covered.has(meta.type));
  }, [templates, accountTypes]);

  if (missing.length === 0) return null;

  const handleAdd = async () => {
    const results = await Promise.allSettled(
      missing.map((meta) => createTemplate.mutateAsync({ name: meta.type, type: meta.type }))
    );

    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed === results.length) return;

    createNotification({
      type: failed ? "warning" : "success",
      text: failed
        ? `Added ${results.length - failed} of ${results.length} default templates`
        : `Added ${results.length} default template${results.length === 1 ? "" : "s"}`
    });
  };

  return (
    <DismissableAlert
      variant="info"
      className="mt-4"
      actionKey={`pam_missing_templates_${missing.map((meta) => meta.type).join("_")}`}
    >
      <InfoIcon />
      <AlertTitle>
        {missing.length} account type{missing.length === 1 ? "" : "s"} without a template
      </AlertTitle>
      <AlertDescription>
        <p>
          Accounts can&apos;t be created for {missing.map((meta) => meta.name).join(", ")} until a
          template exists.{" "}
          <button
            type="button"
            disabled={createTemplate.isPending}
            onClick={handleAdd}
            className="inline cursor-pointer underline hover:opacity-80 disabled:cursor-default disabled:opacity-60"
          >
            {createTemplate.isPending
              ? "Adding..."
              : `Add default template${missing.length === 1 ? "" : "s"}`}
          </button>
        </p>
      </AlertDescription>
    </DismissableAlert>
  );
};
