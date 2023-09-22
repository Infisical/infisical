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
import { DecryptedSecret } from "@app/hooks/api/types";

export enum TDiffModes {
  NoChange = "no change",
  Deleted = "deleted",
  Modified = "modified",
  Created = "created"
}

type Props = {
  mode: TDiffModes;
  preSecret?: DecryptedSecret;
  postSecret: DecryptedSecret;
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
        className="flex group border-b border-mineshaft-600 hover:bg-mineshaft-700 cursor-pointer"
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
        <div className="flex-grow px-4 py-3 flex items-center space-x-4">
          {mode === "modified" ? (
            <>
              <div>{preSecret?.key}</div>
              <div className="bg-primary text-black rounded-lg font-bold px-1 py-0.5 text-xs">
                v{preSecret?.version}
              </div>
              <div>
                <FontAwesomeIcon icon={faChevronRight} size="sm" className="text-orange-700" />
              </div>
              <div className="bg-primary text-black rounded-lg font-bold px-1 py-0.5 text-xs">
                v{postSecret?.version}
              </div>
            </>
          ) : (
            postSecret.key
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="flex bg-bunker-600 cursor-pointer p-4">
          <TableContainer>
            <Table>
              <THead>
                <Th className="min-table-row min-w-[11rem] border-r border-mineshaft-600">Type</Th>
                {isModified ? (
                  <>
                    <Th className="border-r border-mineshaft-600">Before</Th>
                    <Th>After</Th>
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
                      {preSecret?.tags?.map(({ name, _id: tagId, tagColor }) => (
                        <Tag
                          className="flex items-center space-x-2 w-min"
                          key={`${preSecret._id}-${tagId}`}
                        >
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tagColor || "#bec2c8" }}
                          />
                          <div className="text-sm">{name}</div>
                        </Tag>
                      ))}
                    </Td>
                  )}
                  <Td>
                    {postSecret?.tags?.map(({ name, _id: tagId, tagColor }) => (
                      <Tag
                        className="flex items-center space-x-2 w-min"
                        key={`${postSecret._id}-${tagId}`}
                      >
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tagColor || "#bec2c8" }}
                        />
                        <div className="text-sm">{name}</div>
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
