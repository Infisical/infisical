import { faExclamationTriangle, faInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  SecretInput,
  Table,
  TableContainer,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { CommitType, SecretV3Raw, TSecretApprovalSecChange, WsTag } from "@app/hooks/api/types";

export type Props = {
  op: CommitType;
  secretVersion?: SecretV3Raw;
  newVersion?: Omit<TSecretApprovalSecChange, "tags"> & { tags?: WsTag[] };
  presentSecretVersionNumber: number;
  hasMerged?: Boolean;
  conflicts: Array<{ secretId: string; op: CommitType }>;
};

const generateItemTitle = (op: CommitType) => {
  let text = { label: "", color: "" };
  if (op === CommitType.CREATE) text = { label: "create", color: "#16a34a" };
  else if (op === CommitType.UPDATE) text = { label: "change", color: "#ea580c" };
  else text = { label: "deletion", color: "#b91c1c" };

  return (
    <span>
      Request for <span style={{ color: text.color }}>secret {text.label}</span>
    </span>
  );
};

const generateConflictText = (op: CommitType) => {
  if (op === CommitType.CREATE) return <div>Secret already exist</div>;
  if (op === CommitType.UPDATE) return <div>Secret not found</div>;
  return null;
};

export const SecretApprovalRequestChangeItem = ({
  op,
  secretVersion,
  newVersion,
  presentSecretVersionNumber,
  hasMerged,
  conflicts
}: Props) => {
  // meaning request has changed
  const isStale = (secretVersion?.version || 1) < presentSecretVersionNumber;
  const itemConflict =
    hasMerged && conflicts.find((el) => el.op === op && el.secretId === newVersion?.id);
  const hasConflict = Boolean(itemConflict);

  return (
    <div className="rounded-lg bg-bunker-500 px-4 pt-2 pb-4">
      <div className="flex items-center py-3 px-1">
        <div className="flex-grow">{generateItemTitle(op)}</div>
        {!hasMerged && isStale && (
          <div className="flex items-center">
            <FontAwesomeIcon icon={faInfo} className="text-sm text-primary-600" />
            <span className="ml-2 text-xs">Secret has been changed(stale)</span>
          </div>
        )}
        {hasMerged && hasConflict && (
          <div className="flex items-center space-x-2 text-sm text-bunker-300">
            <Tooltip content="Merge Conflict">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-700" />
            </Tooltip>
            <div>{generateConflictText(op)}</div>
          </div>
        )}
      </div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              {op === CommitType.UPDATE && <Th className="w-12" />}
              <Th className="min-table-row">Secret</Th>
              <Th>Value</Th>
              <Th className="min-table-row">Comment</Th>
              <Th className="min-table-row">Tags</Th>
            </Tr>
          </THead>
          {op === CommitType.UPDATE ? (
            <TBody>
              <Tr>
                <Td className="text-red-600">OLD</Td>
                <Td>{secretVersion?.secretKey}</Td>
                <Td>
                  <SecretInput isReadOnly value={secretVersion?.secretValue} />
                </Td>
                <Td>{secretVersion?.secretComment}</Td>
                <Td>
                  {secretVersion?.tags?.map(({ name, id: tagId, color }) => (
                    <Tag
                      className="flex w-min items-center space-x-2"
                      key={`${secretVersion.id}-${tagId}`}
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: color || "#bec2c8" }}
                      />
                      <div className="text-sm">{name}</div>
                    </Tag>
                  ))}
                </Td>
              </Tr>
              <Tr>
                <Td className="text-green-600">NEW</Td>
                <Td>{newVersion?.secretKey}</Td>
                <Td>
                  <SecretInput isReadOnly value={newVersion?.secretValue} />
                </Td>
                <Td>{newVersion?.secretComment}</Td>
                <Td>
                  {newVersion?.tags?.map(({ name, id: tagId, color }) => (
                    <Tag
                      className="flex w-min items-center space-x-2"
                      key={`${newVersion.id}-${tagId}`}
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: color || "#bec2c8" }}
                      />
                      <div className="text-sm">{name}</div>
                    </Tag>
                  ))}
                </Td>
              </Tr>
            </TBody>
          ) : (
            <TBody>
              <Tr>
                <Td>
                  {op === CommitType.CREATE ? newVersion?.secretKey : secretVersion?.secretKey}
                </Td>
                <Td>
                  <SecretInput
                    isReadOnly
                    value={
                      op === CommitType.CREATE
                        ? newVersion?.secretValue
                        : secretVersion?.secretValue
                    }
                  />
                </Td>
                <Td>
                  {op === CommitType.CREATE
                    ? newVersion?.secretComment
                    : secretVersion?.secretComment}
                </Td>
                <Td>
                  {(op === CommitType.CREATE ? newVersion?.tags : secretVersion?.tags)?.map(
                    ({ name, id: tagId, color }) => (
                      <Tag
                        className="flex w-min items-center space-x-2"
                        key={`${
                          op === CommitType.CREATE ? newVersion?.id : secretVersion?.id
                        }-${tagId}`}
                      >
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: color || "#bec2c8" }}
                        />
                        <div className="text-sm">{name}</div>
                      </Tag>
                    )
                  )}
                </Td>
              </Tr>
            </TBody>
          )}
        </Table>
      </TableContainer>
    </div>
  );
};
