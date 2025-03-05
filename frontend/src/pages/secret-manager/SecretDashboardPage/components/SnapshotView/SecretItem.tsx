import {
  faChevronRight,
  faKey,
  faMinusSquare,
  faPencilSquare,
  faPlusSquare,
  faSquare
} from "@fortawesome/free-solid-svg-icons";
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
import { useToggle } from "@app/hooks";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

export enum TDiffModes {
  NoChange = "no change",
  Deleted = "deleted",
  Modified = "modified",
  Created = "created"
}

type Props = {
  mode: TDiffModes;
  preSecret?: SecretV3RawSanitized;
  postSecret: SecretV3RawSanitized;
};
export type TDiffView<T> = {
  mode: TDiffModes;
  pre?: T;
  post: T;
};

export const renderIcon = (mode: TDiffModes) => {
  if (mode === TDiffModes.NoChange)
    return <FontAwesomeIcon icon={faSquare} className="text-gray-700" size="lg" />;
  if (mode === TDiffModes.Deleted)
    return <FontAwesomeIcon icon={faMinusSquare} className="text-red-700" size="lg" />;
  if (mode === TDiffModes.Modified)
    return <FontAwesomeIcon icon={faPencilSquare} className="text-orange-700" size="lg" />;

  return <FontAwesomeIcon icon={faPlusSquare} className="text-green-700" size="lg" />;
};

export const SecretItem = ({ mode, preSecret, postSecret }: Props) => {
  const [isExpanded, setIsExpanded] = useToggle();

  const isModified = mode === "modified";

  return (
    <>
      <div
        className="group flex cursor-pointer border-b border-mineshaft-600 hover:bg-mineshaft-700"
        role="button"
        tabIndex={0}
        onClick={setIsExpanded.toggle}
        onKeyDown={(evt) => {
          if (evt.key === "Enter") setIsExpanded.toggle();
        }}
      >
        <div className="w-12 flex-shrink-0 px-4 py-3">
          <Tooltip content={mode}>{renderIcon(mode)}</Tooltip>
        </div>
        <div className="w-12 flex-shrink-0 px-4 py-3">
          <FontAwesomeIcon icon={faKey} />
        </div>
        <div className="flex flex-grow items-center space-x-4 px-4 py-3">
          {mode === "modified" ? (
            <>
              <div>{preSecret?.key}</div>
              <div className="rounded-lg bg-primary px-1 py-0.5 text-xs font-bold text-black">
                v{preSecret?.version}
              </div>
              <div>
                <FontAwesomeIcon icon={faChevronRight} size="sm" className="text-orange-700" />
              </div>
              <div className="rounded-lg bg-primary px-1 py-0.5 text-xs font-bold text-black">
                v{postSecret?.version}
              </div>
            </>
          ) : (
            postSecret.key
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="flex cursor-pointer bg-bunker-600 p-4">
          <TableContainer>
            <Table>
              <THead>
                <Th className="min-table-row min-w-[11rem] border-r border-mineshaft-600">Type</Th>
                {isModified ? (
                  <>
                    <Th className="border-r border-mineshaft-600">Before rollback</Th>
                    <Th>After rollback</Th>
                  </>
                ) : (
                  <Th>Value</Th>
                )}
              </THead>
              <TBody>
                <Tr>
                  <Td className="border-r border-mineshaft-600">Key</Td>
                  {isModified && (
                    <Td className="border-r border-mineshaft-600">{preSecret?.key}</Td>
                  )}
                  <Td>{postSecret.key}</Td>
                </Tr>
                <Tr>
                  <Td className="border-r border-mineshaft-600">Value</Td>
                  {isModified && (
                    <Td className="border-r border-mineshaft-600">
                      <SecretInput value={preSecret?.value} />
                    </Td>
                  )}
                  <Td>
                    <SecretInput value={postSecret?.value} />
                  </Td>
                </Tr>
                {Boolean(preSecret?.idOverride || postSecret?.idOverride) && (
                  <Tr>
                    <Td className="border-r border-mineshaft-600">Override</Td>
                    {isModified && (
                      <Td className="border-r border-mineshaft-600">
                        <SecretInput value={preSecret?.valueOverride} />
                      </Td>
                    )}
                    <Td>
                      <SecretInput value={postSecret?.valueOverride} />
                    </Td>
                  </Tr>
                )}
                <Tr>
                  <Td className="border-r border-mineshaft-600">Comment</Td>
                  {isModified && (
                    <Td className="border-r border-mineshaft-600">{preSecret?.comment}</Td>
                  )}
                  <Td>{postSecret?.comment}</Td>
                </Tr>
                <Tr>
                  <Td className="border-r border-mineshaft-600">Tags</Td>
                  {isModified && (
                    <Td className="border-r border-mineshaft-600">
                      {preSecret?.tags?.map(({ slug, id: tagId, color }) => (
                        <Tag
                          className="flex w-min items-center space-x-2"
                          key={`${preSecret.id}-${tagId}`}
                        >
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: color || "#bec2c8" }}
                          />
                          <div className="text-sm">{slug}</div>
                        </Tag>
                      ))}
                    </Td>
                  )}
                  <Td>
                    {postSecret?.tags?.map(({ slug, id: tagId, color }) => (
                      <Tag
                        className="flex w-min items-center space-x-2"
                        key={`${postSecret.id}-${tagId}`}
                      >
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: color || "#bec2c8" }}
                        />
                        <div className="text-sm">{slug}</div>
                      </Tag>
                    ))}
                  </Td>
                </Tr>
              </TBody>
            </Table>
          </TableContainer>
        </div>
      )}
    </>
  );
};
