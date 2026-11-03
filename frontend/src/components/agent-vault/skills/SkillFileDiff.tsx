import { useMemo } from "react";
import { twMerge } from "tailwind-merge";

import { buildDiffRows } from "@app/helpers/agentVaultSkills";

type Props = {
  oldText: string;
  newText: string;
};

export const SkillFileDiff = ({ oldText, newText }: Props) => {
  const rows = useMemo(() => buildDiffRows(oldText, newText), [oldText, newText]);

  if (rows.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted">The file is empty.</p>;
  }

  return (
    <div className="thin-scrollbar overflow-x-auto font-mono text-xs leading-relaxed">
      <table className="w-max min-w-full border-collapse">
        <tbody>
          {rows.map((row, index) => {
            if (row.type === "skip") {
              return (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={`skip-${index}`} className="bg-container text-muted">
                  <td colSpan={4} className="px-3 py-0.5">
                    {row.count} unchanged line{row.count === 1 ? "" : "s"}
                  </td>
                </tr>
              );
            }
            let symbol = " ";
            if (row.type === "added") symbol = "+";
            if (row.type === "removed") symbol = "-";
            return (
              <tr
                // eslint-disable-next-line react/no-array-index-key
                key={`line-${index}`}
                className={twMerge(
                  row.type === "added" && "bg-success/15",
                  row.type === "removed" && "bg-danger/15"
                )}
              >
                <td className="w-10 px-2 text-right text-muted select-none">{row.oldLine ?? ""}</td>
                <td className="w-10 px-2 text-right text-muted select-none">{row.newLine ?? ""}</td>
                <td
                  className={twMerge(
                    "w-4 select-none",
                    row.type === "added" && "text-success",
                    row.type === "removed" && "text-danger"
                  )}
                >
                  {symbol}
                </td>
                <td className="pr-3 whitespace-pre">{row.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
