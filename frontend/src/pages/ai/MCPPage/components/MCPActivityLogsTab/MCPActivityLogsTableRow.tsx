import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Td, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";

import { TMCPActivityLog } from "./types";

type Props = {
  activityLog: TMCPActivityLog;
};

const formatTimestamp = (dateString: string): string => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const ToolBadge = ({ tool }: { tool: string }) => (
  <span className="inline-flex items-center rounded bg-mineshaft-600 px-2 py-0.5 font-mono text-xs text-mineshaft-200">
    {tool}
  </span>
);

export const MCPActivityLogsTableRow = ({ activityLog }: Props) => {
  const [isOpen, setIsOpen] = useToggle();

  return (
    <>
      <Tr
        className="h-10 cursor-pointer border-x-0 border-t-0 border-b hover:bg-mineshaft-700"
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen.toggle()}
        onKeyDown={(evt) => {
          if (evt.key === "Enter") setIsOpen.toggle();
        }}
        isHoverable
      >
        <Td className="flex items-center gap-2 pr-0 align-top">
          <FontAwesomeIcon icon={isOpen ? faCaretDown : faCaretRight} />
        </Td>
        <Td className="align-top font-mono text-sm whitespace-nowrap text-mineshaft-300">
          {formatTimestamp(activityLog.createdAt)}
        </Td>
        <Td className="align-top text-mineshaft-200">{activityLog.endpointName}</Td>
        <Td className="align-top">
          <ToolBadge tool={activityLog.toolName} />
        </Td>
        <Td className="align-top text-mineshaft-300">{activityLog.actor}</Td>
      </Tr>
      {isOpen && (
        <Tr className={`log-${activityLog.id} h-10 border-x-0 border-t-0 border-b`}>
          <Td colSpan={5} className="px-3 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-2 text-sm font-medium text-mineshaft-200">Request</h4>
                <div className="h-80 thin-scrollbar overflow-auto rounded-md border border-mineshaft-600 bg-bunker-800 p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-mineshaft-300">
                  {JSON.stringify(activityLog.request, null, 2)}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium text-mineshaft-200">Response</h4>
                <div className="h-80 thin-scrollbar overflow-auto rounded-md border border-mineshaft-600 bg-bunker-800 p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-mineshaft-300">
                  {JSON.stringify(activityLog.response, null, 2)}
                </div>
              </div>
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
};
