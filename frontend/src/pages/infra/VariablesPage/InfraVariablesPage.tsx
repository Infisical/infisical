import { useCallback, useState } from "react";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";

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
import { TInfraVariable } from "@app/hooks/api/infra/types";

type TEditingState = {
  key: string;
  value: string;
  sensitive: boolean;
} | null;

const VariableRow = ({
  variable,
  onEdit,
  onDelete,
  isDeleting
}: {
  variable: TInfraVariable;
  onEdit: (key: string, value: string, sensitive: boolean) => void;
  onDelete: (key: string) => void;
  isDeleting: boolean;
}) => {
  const [editing, setEditing] = useState<TEditingState>(null);
  const [revealed, setRevealed] = useState(false);

  const handleStartEdit = () => {
    setEditing({
      key: variable.key,
      value: variable.sensitive ? "" : variable.value,
      sensitive: variable.sensitive
    });
  };

  const handleSave = () => {
    if (!editing) return;
    onEdit(editing.key, editing.value, editing.sensitive);
    setEditing(null);
  };

  const handleCancel = () => {
    setEditing(null);
  };

  if (editing) {
    return (
      <UnstableTableRow>
        <UnstableTableCell>
          <span className="font-mono text-xs text-mineshaft-200">{variable.key}</span>
        </UnstableTableCell>
        <UnstableTableCell>
          <Input
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            placeholder={variable.sensitive ? "Enter new value" : "Value"}
            className="font-mono text-xs"
            autoFocus
            type={editing.sensitive ? "password" : "text"}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
        </UnstableTableCell>
        <UnstableTableCell>
          <Checkbox
            id={`edit-sensitive-${variable.key}`}
            isChecked={editing.sensitive}
            onCheckedChange={(checked) => setEditing({ ...editing, sensitive: checked === true })}
          >
            Sensitive
          </Checkbox>
        </UnstableTableCell>
        <UnstableTableCell>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSave}
              className="rounded p-1 text-green-400 transition-colors hover:bg-mineshaft-600 hover:text-green-300"
            >
              <CheckIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded p-1 text-mineshaft-400 transition-colors hover:bg-mineshaft-600 hover:text-mineshaft-200"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </UnstableTableCell>
      </UnstableTableRow>
    );
  }

  return (
    <UnstableTableRow className="group">
      <UnstableTableCell>
        <span className="font-mono text-xs text-mineshaft-200">{variable.key}</span>
      </UnstableTableCell>
      <UnstableTableCell>
        {variable.sensitive ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-mineshaft-500">
              {revealed ? variable.value : "••••••••••••"}
            </span>
            <button
              type="button"
              onClick={() => setRevealed((p) => !p)}
              className="text-mineshaft-500 transition-colors hover:text-mineshaft-300"
            >
              {revealed ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
            </button>
          </div>
        ) : (
          <span className="font-mono text-xs text-mineshaft-300">{variable.value}</span>
        )}
      </UnstableTableCell>
      <UnstableTableCell>
        {variable.sensitive ? (
          <Badge variant="warning">
            <EyeOffIcon className="size-3" />
            Sensitive
          </Badge>
        ) : (
          <span className="text-xs text-mineshaft-600">—</span>
        )}
      </UnstableTableCell>
      <UnstableTableCell>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={handleStartEdit}
            className="rounded p-1 text-mineshaft-400 transition-colors hover:bg-mineshaft-600 hover:text-mineshaft-200"
          >
            <PencilIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(variable.key)}
            disabled={isDeleting}
            className="rounded p-1 text-red-400 transition-colors hover:bg-mineshaft-600 hover:text-red-300 disabled:opacity-50"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
      </UnstableTableCell>
    </UnstableTableRow>
  );
};

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

  const handleEdit = useCallback(
    async (key: string, value: string, sensitive: boolean) => {
      await upsertVariable.mutateAsync({ projectId, key, value, sensitive });
    },
    [projectId, upsertVariable]
  );

  const handleDelete = useCallback(
    async (key: string) => {
      await deleteVariable.mutateAsync({ projectId, key });
    },
    [projectId, deleteVariable]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const envVarCount = variables?.filter((v) => !v.key.startsWith("TF_VAR_")).length ?? 0;
  const tfVarCount = variables?.filter((v) => v.key.startsWith("TF_VAR_")).length ?? 0;
  const sensitiveCount = variables?.filter((v) => v.sensitive).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-mineshaft-100">Variables</h1>
          <p className="mt-1 text-sm text-mineshaft-400">
            Environment variables and Terraform variables injected during runs.
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
            <UnstableTableHead className="w-20" />
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
                  type={newSensitive ? "password" : "text"}
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
            <VariableRow
              key={v.id}
              variable={v}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isDeleting={deleteVariable.isPending}
            />
          ))}
          {(!variables || variables.length === 0) && !isAdding && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={4} className="py-8 text-center">
                <div className="flex flex-col items-center gap-2">
                  <KeyIcon className="size-8 text-mineshaft-500" />
                  <p className="text-sm text-mineshaft-400">
                    No variables configured. Click &quot;Add Variable&quot; to get started.
                  </p>
                </div>
              </UnstableTableCell>
            </UnstableTableRow>
          )}
        </UnstableTableBody>
      </UnstableTable>

      <UnstableAlert variant="info">
        <LinkIcon className="size-4" />
        <UnstableAlertTitle>How Variables Work</UnstableAlertTitle>
        <UnstableAlertDescription>
          <span className="flex flex-col gap-1">
            <span>
              Variables prefixed with{" "}
              <code className="rounded bg-mineshaft-700 px-1 py-0.5 text-xs">TF_VAR_</code> are
              passed as Terraform input variables. All other variables (e.g.{" "}
              <code className="rounded bg-mineshaft-700 px-1 py-0.5 text-xs">
                AWS_ACCESS_KEY_ID
              </code>
              ) are injected as environment variables for provider authentication.
            </span>
          </span>
        </UnstableAlertDescription>
      </UnstableAlert>
    </div>
  );
};
