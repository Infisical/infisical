import { faExclamationTriangle, faInfo, faKey } from "@fortawesome/free-solid-svg-icons";
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
  newVersion?: Omit<TSecretApprovalSecChange, "tags"> & {
    tags?: WsTag[];
    secretMetadata?: { key: string; value: string }[];
  };
  presentSecretVersionNumber: number;
  hasMerged?: boolean;
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
    <div className="rounded-lg bg-bunker-500 px-4 pb-4 pt-2">
      <div className="flex items-center px-1 py-3">
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
              {op === CommitType.UPDATE && <Th className="w-12 shrink-0" />}
              <Th className="w-48 shrink-0">Secret</Th>
              <Th className="min-w-0 flex-1">Value</Th>
              <Th className="w-24 shrink-0">Comment</Th>
              <Th className="w-24 shrink-0">Tags</Th>
              <Th className="w-40 shrink-0">Metadata</Th>
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
                <Td className="flex flex-wrap gap-2">
                  {secretVersion?.tags?.map(({ slug, id: tagId, color }) => (
                    <Tag
                      className="flex w-min items-center space-x-2"
                      key={`${secretVersion.id}-${tagId}`}
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: color || "#bec2c8" }}
                      />
                      <div className="text-sm">{slug}</div>
                    </Tag>
                  ))}
                </Td>
                <Td>
                  {secretVersion?.secretMetadata?.length ? (
                    <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
                      {secretVersion.secretMetadata?.map((el) => (
                        <div key={el.key} className="flex items-center">
                          <Tag
                            size="xs"
                            className="mr-0 flex items-center rounded-r-none border border-mineshaft-500"
                          >
                            <FontAwesomeIcon icon={faKey} size="xs" className="mr-1" />
                            <div>{el.key}</div>
                          </Tag>
                          <Tag
                            size="xs"
                            className="flex items-center rounded-l-none border border-mineshaft-500 bg-mineshaft-900 pl-1"
                          >
                            <div className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                              {el.value}
                            </div>
                          </Tag>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-mineshaft-300">-</p>
                  )}
                </Td>
              </Tr>
              <Tr>
                <Td className="text-green-600">NEW</Td>
                <Td>{newVersion?.secretKey}</Td>
                <Td>
                  <SecretInput isReadOnly value={newVersion?.secretValue} />
                </Td>
                <Td>{newVersion?.secretComment}</Td>
                <Td className="flex flex-wrap gap-2">
                  {newVersion?.tags?.map(({ slug, id: tagId, color }) => (
                    <Tag
                      className="flex w-min items-center space-x-2"
                      key={`${newVersion.id}-${tagId}`}
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: color || "#bec2c8" }}
                      />
                      <div className="text-sm">{slug}</div>
                    </Tag>
                  ))}
                </Td>
                <Td>
                  {newVersion?.secretMetadata?.length ? (
                    <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
                      {newVersion.secretMetadata?.map((el) => (
                        <div key={el.key} className="flex items-center">
                          <Tag
                            size="xs"
                            className="mr-0 flex items-center rounded-r-none border border-mineshaft-500"
                          >
                            <FontAwesomeIcon icon={faKey} size="xs" className="mr-1" />
                            <div>{el.key}</div>
                          </Tag>
                          <Tag
                            size="xs"
                            className="flex items-center rounded-l-none border border-mineshaft-500 bg-mineshaft-900 pl-1"
                          >
                            <div className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                              {el.value}
                            </div>
                          </Tag>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-mineshaft-300">-</p>
                  )}
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
                    ({ slug, id: tagId, color }) => (
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
                        <div className="text-sm">{slug}</div>
                      </Tag>
                    )
                  )}
                </Td>
                <Td>
                  {newVersion?.secretMetadata?.length ? (
                    <div className="mt-1 flex flex-wrap gap-2 text-sm text-mineshaft-300">
                      {newVersion.secretMetadata?.map((el) => (
                        <div key={el.key} className="flex items-center">
                          <Tag
                            size="xs"
                            className="mr-0 flex items-center rounded-r-none border border-mineshaft-500"
                          >
                            <FontAwesomeIcon icon={faKey} size="xs" className="mr-1" />
                            <div>{el.key}</div>
                          </Tag>
                          <Tag
                            size="xs"
                            className="flex items-center rounded-l-none border border-mineshaft-500 bg-mineshaft-900 pl-1"
                          >
                            <div className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                              {el.value}
                            </div>
                          </Tag>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-mineshaft-300">-</p>
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
