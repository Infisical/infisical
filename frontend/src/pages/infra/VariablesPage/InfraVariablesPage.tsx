import { useState } from "react";
import { EyeOffIcon, LinkIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Checkbox, Input, Skeleton } from "@app/components/v2";
import {
  Badge,
  Button,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useDeleteInfraVariable,
  useInfraVariables,
  useUpsertInfraVariable
} from "@app/hooks/api/infra";

export const InfraVariablesPage = () => {
  const { currentProject } = useProject();
  const projectId = currentProject.id;

  const { data: variables, isLoading } = useInfraVariables(projectId);
  const upsertVariable = useUpsertInfraVariable();
  const deleteVariable = useDeleteInfraVariable();

  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSensitive, setNewSensitive] = useState(false);

  const handleAdd = async () => {
    if (!newKey.trim()) return;
    await upsertVariable.mutateAsync({
      projectId,
      key: newKey.trim(),
      value: newValue,
      sensitive: newSensitive
    });
    setNewKey("");
    setNewValue("");
    setNewSensitive(false);
    setIsAdding(false);
  };

  const handleDelete = async (key: string) => {
    await deleteVariable.mutateAsync({ projectId, key });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-mineshaft-100">Variables</h1>
          <p className="mt-1 text-sm text-mineshaft-400">
            Variables injected as{" "}
            <code className="rounded bg-mineshaft-700 px-1 py-0.5 text-xs">TF_VAR_*</code>{" "}
            environment variables during runs.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<PlusIcon className="size-4" />}
          onClick={() => setIsAdding(true)}
          isDisabled={isAdding}
        >
          Add Variable
        </Button>
      </div>

      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Key</UnstableTableHead>
            <UnstableTableHead>Value</UnstableTableHead>
            <UnstableTableHead>Sensitive</UnstableTableHead>
            <UnstableTableHead className="w-16" />
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {isAdding && (
            <UnstableTableRow>
              <UnstableTableCell>
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. AWS_ACCESS_KEY_ID"
                  className="font-mono text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                    if (e.key === "Escape") setIsAdding(false);
                  }}
                />
              </UnstableTableCell>
              <UnstableTableCell>
                <Input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Value"
                  className="font-mono text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                    if (e.key === "Escape") setIsAdding(false);
                  }}
                />
              </UnstableTableCell>
              <UnstableTableCell>
                <Checkbox
                  id="new-sensitive"
                  isChecked={newSensitive}
                  onCheckedChange={(checked) => setNewSensitive(checked === true)}
                >
                  Sensitive
                </Checkbox>
              </UnstableTableCell>
              <UnstableTableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleAdd}
                    isLoading={upsertVariable.isPending}
                  >
                    Save
                  </Button>
                  <Button variant="plain" size="xs" onClick={() => setIsAdding(false)}>
                    Cancel
                  </Button>
                </div>
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {variables?.map((v) => (
            <UnstableTableRow key={v.id}>
              <UnstableTableCell className="font-mono text-xs">{v.key}</UnstableTableCell>
              <UnstableTableCell className="font-mono text-xs text-mineshaft-400">
                {v.value}
              </UnstableTableCell>
              <UnstableTableCell>
                {v.sensitive ? (
                  <Badge variant="warning">
                    <EyeOffIcon className="size-3" />
                    Sensitive
                  </Badge>
                ) : (
                  <span className="text-xs text-mineshaft-600">—</span>
                )}
              </UnstableTableCell>
              <UnstableTableCell>
                <Button
                  variant="plain"
                  size="xs"
                  onClick={() => handleDelete(v.key)}
                  isLoading={deleteVariable.isPending}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </UnstableTableCell>
            </UnstableTableRow>
          ))}
          {(!variables || variables.length === 0) && !isAdding && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={4} className="text-center text-sm text-mineshaft-400">
                No variables configured. Click &quot;Add Variable&quot; to get started.
              </UnstableTableCell>
            </UnstableTableRow>
          )}
        </UnstableTableBody>
      </UnstableTable>

      <UnstableAlert variant="info">
        <LinkIcon className="size-4" />
        <UnstableAlertTitle>Environment Variables</UnstableAlertTitle>
        <UnstableAlertDescription className="flex">
          All variables are injected as environment variables into OpenTofu runs. Use names like{" "}
          <code className="rounded bg-mineshaft-700 px-1 py-0.5 text-xs">AWS_ACCESS_KEY_ID</code>,{" "}
          <code className="rounded bg-mineshaft-700 px-1 py-0.5 text-xs">
            AWS_SECRET_ACCESS_KEY
          </code>
          , or <code className="rounded bg-mineshaft-700 px-1 py-0.5 text-xs">TF_VAR_*</code> for
          Terraform variables.
        </UnstableAlertDescription>
      </UnstableAlert>
    </div>
  );
};
