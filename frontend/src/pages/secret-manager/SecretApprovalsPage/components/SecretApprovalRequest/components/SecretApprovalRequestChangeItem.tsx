/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable no-nested-ternary */
import { useState } from "react";
import {
  faCircleXmark,
  faExclamationTriangle,
  faEye,
  faEyeSlash,
  faInfo,
  faKey
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { SecretInput, Tag, Tooltip } from "@app/components/v2";
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
  if (op === CommitType.CREATE) text = { label: "create", color: "#60DD00" };
  else if (op === CommitType.UPDATE) text = { label: "change", color: "#F8EB30" };
  else text = { label: "deletion", color: "#F83030" };

  return (
    <div className="text-md pb-2 font-medium">
      Request for <span style={{ color: text.color }}>secret {text.label}</span>
    </div>
  );
};

const generateConflictText = (op: CommitType) => {
  if (op === CommitType.CREATE) return <div>Secret already exists</div>;
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
  const [isOldSecretValueVisible, setIsOldSecretValueVisible] = useState(false);
  const [isNewSecretValueVisible, setIsNewSecretValueVisible] = useState(false);

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 pb-4 pt-2">
      <div className="flex items-center px-1 py-1">
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
      <div>
        <div className="flex flex-col space-x-0 space-y-4 xl:flex-row xl:space-x-4 xl:space-y-0">
          {op === CommitType.UPDATE || op === CommitType.DELETE ? (
            <div className="flex w-full cursor-default flex-col rounded-md border border-red-600/60 bg-red-600/10 p-4 xl:w-1/2">
              <div className="mb-4 flex flex-row justify-between">
                <span className="text-md font-medium">Previous Secret</span>
                <div className="rounded-full bg-red px-2 pb-[0.14rem] pt-[0.2rem] text-xs font-medium">
                  <FontAwesomeIcon icon={faCircleXmark} className="pr-1 text-white" />
                  Previous
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Key</div>
                <div className="text-sm">{secretVersion?.secretKey} </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Value</div>
                <div className="text-sm">
                  {newVersion?.isRotatedSecret ? (
                    <span className="text-mineshaft-400">
                      Rotated Secret value will not be affected
                    </span>
                  ) : (
                    <div className="relative">
                      {secretVersion?.secretValueHidden && (
                        <div className="absolute left-1 top-1/2 z-50 -translate-y-1/2">
                          <Tooltip
                            position="right"
                            content="You do not have access to view the old secret value."
                          >
                            <FontAwesomeIcon
                              className="pl-2 text-mineshaft-300"
                              size="sm"
                              icon={faEyeSlash}
                            />
                          </Tooltip>
                        </div>
                      )}
                      <SecretInput
                        isReadOnly
                        isVisible={isOldSecretValueVisible}
                        valueAlwaysHidden={secretVersion?.secretValueHidden}
                        value={secretVersion?.secretValue}
                        containerClassName={twMerge(
                          "border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50",
                          secretVersion?.secretValueHidden ? "pl-8 pr-2" : "px-2"
                        )}
                      />
                      {!secretVersion?.secretValueHidden && (
                        <div
                          className="absolute right-1 top-1"
                          onClick={() => setIsOldSecretValueVisible(!isOldSecretValueVisible)}
                        >
                          <FontAwesomeIcon
                            icon={isOldSecretValueVisible ? faEyeSlash : faEye}
                            className="cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-800 p-1.5 text-mineshaft-300 hover:bg-mineshaft-700"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Comment</div>
                <div className="max-h-[5rem] overflow-y-auto text-sm">
                  {secretVersion?.secretComment || (
                    <span className="text-sm text-mineshaft-300">-</span>
                  )}{" "}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {(secretVersion?.tags?.length ?? 0) ? (
                    secretVersion?.tags?.map(({ slug, id: tagId, color }) => (
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
                    ))
                  ) : (
                    <span className="text-sm text-mineshaft-300">-</span>
                  )}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Metadata</div>
                <div>
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
                </div>
              </div>
            </div>
          ) : (
            <div className="text-md flex w-full items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 text-mineshaft-300 xl:w-1/2">
              Secret did not exist in the previous version.
            </div>
          )}
          {op === CommitType.UPDATE || op === CommitType.CREATE ? (
            <div className="flex w-full cursor-default flex-col rounded-md border border-green-600/60 bg-green-600/10 p-4 xl:w-1/2">
              <div className="mb-4 flex flex-row justify-between">
                <span className="text-md font-medium">New Secret</span>
                <div className="rounded-full bg-green-600 px-2 pb-[0.14rem] pt-[0.2rem] text-xs font-medium">
                  <FontAwesomeIcon icon={faCircleXmark} className="pr-1 text-white" />
                  New
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Key</div>
                <div className="text-sm">{newVersion?.secretKey} </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Value</div>
                <div className="text-sm">
                  {newVersion?.isRotatedSecret ? (
                    <span className="text-mineshaft-400">
                      Rotated Secret value will not be affected
                    </span>
                  ) : (
                    <div className="relative">
                      {newVersion?.secretValueHidden && (
                        <div className="absolute left-1 top-1/2 z-50 -translate-y-1/2">
                          <Tooltip
                            position="right"
                            content="You do not have access to view the new secret value."
                          >
                            <FontAwesomeIcon
                              className="pl-2 text-mineshaft-300"
                              size="sm"
                              icon={faEyeSlash}
                            />
                          </Tooltip>
                        </div>
                      )}
                      <SecretInput
                        isReadOnly
                        valueAlwaysHidden={newVersion?.secretValueHidden}
                        isVisible={isNewSecretValueVisible}
                        value={newVersion?.secretValue}
                        containerClassName={twMerge(
                          "border border-mineshaft-600 bg-bunker-700 py-1.5 text-bunker-300 hover:border-primary-400/50",
                          newVersion?.secretValueHidden ? "pl-8 pr-2" : "px-2"
                        )}
                      />
                      {!newVersion?.secretValueHidden && (
                        <div
                          className="absolute right-1 top-1"
                          onClick={() => setIsNewSecretValueVisible(!isNewSecretValueVisible)}
                        >
                          <FontAwesomeIcon
                            icon={isNewSecretValueVisible ? faEyeSlash : faEye}
                            className="cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-800 p-1.5 text-mineshaft-300 hover:bg-mineshaft-700"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Comment</div>
                <div className="max-h-[5rem] overflow-y-auto text-sm">
                  {newVersion?.secretComment || (
                    <span className="text-sm text-mineshaft-300">-</span>
                  )}{" "}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {(newVersion?.tags?.length ?? 0) ? (
                    newVersion?.tags?.map(({ slug, id: tagId, color }) => (
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
                    ))
                  ) : (
                    <span className="text-sm text-mineshaft-300">-</span>
                  )}
                </div>
              </div>
              <div className="mb-2">
                <div className="text-sm font-medium text-mineshaft-300">Metadata</div>
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
              </div>
            </div>
          ) : (
            <div className="text-md flex w-full items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 text-mineshaft-300 xl:w-1/2">
              {" "}
              Secret did not exist in the previous version.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
