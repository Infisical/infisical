import { Dispatch, SetStateAction, useState } from "react";
import { ArrowRightIcon, AsteriskIcon, KeyIcon, MessageSquareIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { FormLabel } from "@app/components/v2";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";

type TParsedEnv = Record<string, { value: string; comments: string[] }>;

type SecretMatrixMap = {
  key: number;
  value: number | null;
  comment: number | null;
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  headers: string[];
  matrix: string[][];
  onParsedSecrets: (env: TParsedEnv) => void;
};

const MatrixImportModalTableRow = ({
  importSecretMatrixMap,
  setImportSecretMatrixMap,
  headers,
  mapKey
}: {
  importSecretMatrixMap: SecretMatrixMap;
  setImportSecretMatrixMap: Dispatch<SetStateAction<SecretMatrixMap>>;
  headers: string[];
  mapKey: keyof SecretMatrixMap;
}) => {
  return (
    <tr>
      <td className="w-full py-2">
        <Select
          value={importSecretMatrixMap[mapKey]?.toString() || (null as unknown as string)}
          onValueChange={(v) =>
            setImportSecretMatrixMap((ism) => ({
              ...ism,
              [mapKey]: v ? parseInt(v, 10) : null
            }))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
          <SelectContent position="popper" className="max-w-none">
            {mapKey !== "key" && <SelectItem value={null as unknown as string}>None</SelectItem>}
            {headers.map((header, col) => (
              <SelectItem value={col.toString()} key={`${mapKey}-${header}`}>
                {header}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="pr-5 pl-5 whitespace-nowrap">
        <div className="flex items-center justify-center">
          <ArrowRightIcon className="size-5 text-accent" />
        </div>
      </td>
      <td className="whitespace-nowrap">
        <div className="flex h-full items-start justify-center">
          <Badge isFullWidth variant="neutral">
            {mapKey === "key" && (
              <>
                <KeyIcon />
                Secret Key
              </>
            )}
            {mapKey === "value" && (
              <>
                <AsteriskIcon />
                Secret Value
              </>
            )}
            {mapKey === "comment" && (
              <>
                <MessageSquareIcon />
                Comment
              </>
            )}
          </Badge>
        </div>
      </td>
    </tr>
  );
};

type ContentProps = {
  headers: string[];
  matrix: string[][];
  onParsedSecrets: (env: TParsedEnv) => void;
  onClose: () => void;
};

const CsvColumnMapContent = ({ headers, matrix, onParsedSecrets, onClose }: ContentProps) => {
  const [importSecretMatrixMap, setImportSecretMatrixMap] = useState<SecretMatrixMap>({
    key: 0,
    value: null,
    comment: null
  });

  const handleImport = () => {
    if (!matrix.length) {
      createNotification({
        text: "Invalid secret matrix.",
        type: "error"
      });
      return;
    }

    const env: TParsedEnv = {};
    matrix.forEach((row) => {
      const key = row[importSecretMatrixMap.key];
      if (key) {
        env[key] = {
          value: importSecretMatrixMap.value !== null ? row[importSecretMatrixMap.value] || "" : "",
          comments:
            importSecretMatrixMap.comment !== null ? [row[importSecretMatrixMap.comment] || ""] : []
        };
      }
    });

    setImportSecretMatrixMap({ key: 0, value: null, comment: null });
    onClose();
    onParsedSecrets(env);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import Column Mapping</DialogTitle>
        <p className="text-sm text-accent">
          Map your data columns to different parts of the secret
        </p>
      </DialogHeader>
      <div className="w-full overflow-hidden">
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left">
              <th>
                <FormLabel tooltipClassName="max-w-sm" label="Import Column" />
              </th>
              <th />
              <th className="whitespace-nowrap">
                <FormLabel label="Resulting Import" />
              </th>
            </tr>
          </thead>
          <tbody>
            <MatrixImportModalTableRow
              importSecretMatrixMap={importSecretMatrixMap}
              setImportSecretMatrixMap={setImportSecretMatrixMap}
              headers={headers}
              mapKey="key"
            />
            <MatrixImportModalTableRow
              importSecretMatrixMap={importSecretMatrixMap}
              setImportSecretMatrixMap={setImportSecretMatrixMap}
              headers={headers}
              mapKey="value"
            />
            <MatrixImportModalTableRow
              importSecretMatrixMap={importSecretMatrixMap}
              setImportSecretMatrixMap={setImportSecretMatrixMap}
              headers={headers}
              mapKey="comment"
            />
          </tbody>
        </table>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="project" onClick={handleImport}>
          Confirm Mapping
        </Button>
      </DialogFooter>
    </>
  );
};

export const CsvColumnMapDialog = ({
  isOpen,
  onOpenChange,
  headers,
  matrix,
  onParsedSecrets
}: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <CsvColumnMapContent
          headers={headers}
          matrix={matrix}
          onParsedSecrets={onParsedSecrets}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};
