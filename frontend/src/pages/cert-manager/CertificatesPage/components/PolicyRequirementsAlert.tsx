import { ListChecks, Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";

import { PolicyRequirement } from "./certificatePolicyGuidance";

type Props = {
  requirements: PolicyRequirement[];
  onAddMissing?: () => void;
};

export const PolicyRequirementsAlert = ({ requirements, onAddMissing }: Props) => {
  if (requirements.length === 0) return null;

  const canAddMissing = Boolean(onAddMissing) && requirements.some(({ addRows }) => addRows);

  return (
    <Alert variant="warning" className="mb-4">
      <ListChecks />
      <AlertTitle>Still required by this profile&apos;s policy</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {requirements.map(({ id, message }) => (
            <li key={id}>{message}</li>
          ))}
        </ul>
        {canAddMissing && (
          <Button type="button" variant="outline" size="xs" className="mt-2" onClick={onAddMissing}>
            <Plus /> Add Missing Fields
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};
