import { faCircleXmark, faExclamationTriangle, faEye, faEyeSlash, faInfo, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Tag,
  Tooltip
} from "@app/components/v2";
import { CommitType, SecretV3Raw, TSecretApprovalSecChange, WsTag } from "@app/hooks/api/types";
import { useState } from "react";

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
    <div className="text-md font-medium pb-2">
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
    <div className="rounded-lg bg-mineshaft-900 px-4 pb-4 pt-2 border border-mineshaft-600">
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
        <div className="flex flex-col xl:flex-row space-y-4 xl:space-y-0 space-x-0 xl:space-x-4">
          {op === CommitType.UPDATE || op === CommitType.DELETE ? (
            <div className="flex flex-col border border-red-600/60 bg-red-600/10 p-4 w-full xl:w-1/2 rounded-md cursor-default">
              <div className="flex flex-row justify-between mb-4">
                <span className="text-md font-medium">Legacy Secret</span>
                <div className="pt-[0.2rem] pb-[0.14rem] px-2 bg-red text-xs rounded-full font-medium">
                  <FontAwesomeIcon icon={faCircleXmark} className="text-white pr-1" />
                  Deprecated
                </div>
              </div>
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Key</div>
                <div className="text-sm">{secretVersion?.secretKey} </div>
              </div>
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Value</div>
                <div className="text-sm">{newVersion?.isRotatedSecret ? (
                      <span className="text-mineshaft-400">
                        Rotated Secret value will not be affected
                      </span>
                    ) : (
                      <div onClick={() => setIsOldSecretValueVisible(!isOldSecretValueVisible)} className="pl-2 border border-mineshaft-500 bg-mineshaft-900 rounded-md flex flex-row justify-between items-center">
                        <div className={`flex font-mono ${isOldSecretValueVisible || !secretVersion?.secretValue ? "text-md py-[0.55rem]" : "text-lg"}`}>{isOldSecretValueVisible ? (secretVersion?.secretValue || "EMPTY") : (secretVersion?.secretValue ? secretVersion?.secretValue?.split('').map((_, index) => "•") : "EMPTY")} </div>
                        {secretVersion?.secretValue && <div className="flex items-center w-10 h-10 justify-center"><FontAwesomeIcon icon={isOldSecretValueVisible ? faEyeSlash : faEye} className="text-mineshaft-300 p-1.5 border border-mineshaft-500 rounded-md bg-mineshaft-800 hover:bg-mineshaft-700 cursor-pointer" /></div>}
                      </div>
                    )} 
                </div>
              </div>
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Comment</div>
                <div className="text-sm">{secretVersion?.secretComment || <span className="text-sm text-mineshaft-300">-</span>} </div>
              </div>  
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {secretVersion?.tags?.length ?? 0 ? secretVersion?.tags?.map(({ slug, id: tagId, color }) => (
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
                  )) : <span className="text-sm text-mineshaft-300">-</span>}
                </div>
              </div>
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Metadata</div>
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
            </div>)
            : <div className="w-full xl:w-1/2 bg-mineshaft-800 border border-mineshaft-600 rounded-md flex items-center justify-center text-md text-mineshaft-300"> Secret not existent in the previous version.</div>}
            {op === CommitType.UPDATE || op === CommitType.CREATE ? (
            <div className="flex flex-col border border-green-600/60 bg-green-600/10 p-4 w-full xl:w-1/2 rounded-md cursor-default">
              <div className="flex flex-row justify-between mb-4">
                <span className="text-md font-medium">New Secret</span>
                <div className="pt-[0.2rem] pb-[0.14rem] px-2 bg-green-600 text-xs rounded-full font-medium">
                  <FontAwesomeIcon icon={faCircleXmark} className="text-white pr-1" />
                  Current
                </div>
              </div>
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Key</div>
                <div className="text-sm">{newVersion?.secretKey} </div>
              </div>
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Value</div>
                <div className="text-sm">{newVersion?.isRotatedSecret ? (
                      <span className="text-mineshaft-400">
                        Rotated Secret value will not be affected
                      </span>
                    ) : (
                      <div onClick={() => setIsNewSecretValueVisible(!isNewSecretValueVisible)} className="pl-2 border border-mineshaft-500 bg-mineshaft-900 rounded-md flex flex-row justify-between items-center">
                        <div className={`flex font-mono ${isNewSecretValueVisible || !newVersion?.secretValue ? "text-md py-[0.55rem]" : "text-lg"}`}>{isNewSecretValueVisible ? (newVersion?.secretValue || "EMPTY") : (newVersion?.secretValue ? newVersion?.secretValue?.split('').map((_, index) => "•") : "EMPTY")} </div>
                        {newVersion?.secretValue && <div className="flex items-center w-10 h-10 justify-center"><FontAwesomeIcon icon={isNewSecretValueVisible ? faEyeSlash : faEye} className="text-mineshaft-300 p-1.5 border border-mineshaft-500 rounded-md bg-mineshaft-800 hover:bg-mineshaft-700 cursor-pointer" /></div>}
                      </div>
                    )} 
                </div>
              </div>
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Comment</div>
                <div className="text-sm">{newVersion?.secretComment || <span className="text-sm text-mineshaft-300">-</span>} </div>
              </div> 
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {newVersion?.tags?.length ?? 0 ? newVersion?.tags?.map(({ slug, id: tagId, color }) => (
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
                  )) : <span className="text-sm text-mineshaft-300">-</span>}
                </div>
              </div>
              <div className="mb-2"> 
                <div className="text-sm text-mineshaft-300 font-medium">Metadata</div>
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
            </div>) 
            : <div className="w-full xl:w-1/2 bg-mineshaft-800 border border-mineshaft-600 rounded-md flex items-center justify-center text-md text-mineshaft-300"> Secret not existent in the new version.</div>}
          </div>
      </div>
    </div>
  );
};
