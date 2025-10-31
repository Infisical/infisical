import { faCheckCircle, faTimesCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { PolicyBlock, PolicyLine } from "./VaultPolicyAnalyzer.utils";

type Props = {
  blocks: PolicyBlock[];
  lines: PolicyLine[];
};

export const VaultPolicyPreview = ({ blocks, lines }: Props) => {
  // Create a map of block IDs to blocks for quick lookup
  const blockMap = new Map(blocks.map((block) => [block.id, block]));

  return (
    <div className="flex h-[30rem] flex-col rounded-md border border-mineshaft-600 bg-mineshaft-900">
      <div className="flex-1 overflow-auto font-mono text-xs">
        {lines.map((line) => {
          const block = line.belongsToBlock ? blockMap.get(line.belongsToBlock) : null;
          const isPartOfBlock = line.type === "part-of-block";
          const isComment = line.type === "comment";
          const isEmpty = line.type === "empty";

          let bgColorClass = "";
          let borderColorClass = "";
          let textColorClass = "text-mineshaft-300";
          let showIndicator = false;
          let indicator: JSX.Element | null = null;

          if (isPartOfBlock && block) {
            showIndicator = line.lineNumber === block.startLine;
            if (block.canTranslate) {
              bgColorClass = "bg-green-500/10";
              borderColorClass = "border-l-2 border-green-500/50";
              textColorClass = "text-green-100";
              if (showIndicator) {
                indicator = (
                  <div className="flex items-center gap-2 text-green-400">
                    <FontAwesomeIcon icon={faCheckCircle} className="h-3 w-3" />
                    <span className="text-xs">Can translate</span>
                  </div>
                );
              }
            } else {
              bgColorClass = "bg-red-500/10";
              borderColorClass = "border-l-2 border-red-500/50";
              textColorClass = "text-red-100";
              if (showIndicator) {
                indicator = (
                  <div className="flex items-center gap-2 text-red-400">
                    <FontAwesomeIcon icon={faTimesCircle} className="h-3 w-3" />
                    <span className="text-xs">{block.reason || "Cannot translate"}</span>
                  </div>
                );
              }
            }
          } else if (isComment) {
            textColorClass = "text-mineshaft-500 italic";
          }

          return (
            <div key={line.id} className="group relative">
              {showIndicator && indicator && (
                <div
                  className={twMerge(
                    "flex items-center px-4 py-1.5",
                    block?.canTranslate ? "bg-green-500/5" : "bg-red-500/5"
                  )}
                >
                  {indicator}
                </div>
              )}
              <div
                className={twMerge(
                  "px-4 py-0.5 leading-6",
                  bgColorClass,
                  borderColorClass,
                  isEmpty && "min-h-[1.5rem]"
                )}
              >
                <span className={twMerge("font-mono whitespace-pre", textColorClass)}>
                  {line.text || " "}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
