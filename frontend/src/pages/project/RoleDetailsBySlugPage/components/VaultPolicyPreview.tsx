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
    <div className="flex h-[30rem] flex-col rounded-md border border-border bg-card">
      <div className="flex-1 overflow-auto font-mono text-xs">
        {lines.map((line) => {
          const block = line.belongsToBlock ? blockMap.get(line.belongsToBlock) : null;
          const isPartOfBlock = line.type === "part-of-block";
          const isComment = line.type === "comment";
          const isEmpty = line.type === "empty";

          let bgColorClass = "";
          let borderColorClass = "";
          let textColorClass = "text-label";
          let showIndicator = false;
          let indicator: JSX.Element | null = null;

          if (isPartOfBlock && block) {
            showIndicator = line.lineNumber === block.startLine;
            if (block.canTranslate) {
              bgColorClass = "bg-success/10";
              borderColorClass = "border-l-2 border-success/50";
              textColorClass = "text-success";
              if (showIndicator) {
                indicator = (
                  <div className="flex items-center gap-2 text-success">
                    <FontAwesomeIcon icon={faCheckCircle} className="h-3 w-3" />
                    <span className="text-xs">Can translate</span>
                  </div>
                );
              }
            } else {
              bgColorClass = "bg-danger/10";
              borderColorClass = "border-l-2 border-danger/50";
              textColorClass = "text-danger";
              if (showIndicator) {
                indicator = (
                  <div className="flex items-center gap-2 text-danger">
                    <FontAwesomeIcon icon={faTimesCircle} className="h-3 w-3" />
                    <span className="text-xs">{block.reason || "Cannot translate"}</span>
                  </div>
                );
              }
            }
          } else if (isComment) {
            textColorClass = "text-muted italic";
          }

          return (
            <div key={line.id} className="group relative">
              {showIndicator && indicator && (
                <div
                  className={twMerge(
                    "flex items-center px-4 py-1.5",
                    block?.canTranslate ? "bg-success/5" : "bg-danger/5"
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
