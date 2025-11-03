import { useState } from "react";

import { HighlightText } from "@app/components/v2/HighlightText";
import { PamResourceType } from "@app/hooks/api/pam";

type TableLog = {
  command?: string;
  data_rows: Record<string, string | number | null>[];
  total_rows?: number;
};

export const PamSessionLogOutput = ({
  content,
  resourceType,
  search
}: {
  content: string;
  resourceType: PamResourceType;
  search: string;
}) => {
  const [isRawView, setIsRawView] = useState(false);

  let parsedContent: TableLog | null = null;

  if (resourceType === PamResourceType.Postgres || resourceType === PamResourceType.MySQL) {
    try {
      const parsed = JSON.parse(content);

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.data_rows &&
        Array.isArray(parsed.data_rows) &&
        parsed.data_rows.length > 0 &&
        typeof parsed.data_rows[0] === "object" &&
        parsed.data_rows[0] !== null
      ) {
        parsedContent = parsed;
      }
    } catch {
      // Not a valid JSON or doesn't match structure, will render as plain text
    }
  }

  if (parsedContent) {
    const headers = Object.keys(parsedContent.data_rows[0]);
    return (
      <div className="font-sans">
        {isRawView ? (
          <div className="font-mono break-all whitespace-pre-wrap">
            <HighlightText text={content} highlight={search} />
          </div>
        ) : (
          <>
            {parsedContent.command && (
              <div className="mb-2 font-mono">{`> ${parsedContent.command}`}</div>
            )}
            <div className="overflow-x-auto rounded-md border border-mineshaft-600">
              <table className="w-full min-w-max text-left">
                <thead className="bg-mineshaft-800">
                  <tr className="border-b border-mineshaft-600">
                    {headers.map((header) => (
                      <th key={header} className="p-2 font-semibold text-mineshaft-200 capitalize">
                        <HighlightText text={header.replace(/_/g, " ")} highlight={search} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedContent.data_rows.map((row, rowIndex) => (
                    <tr
                      // eslint-disable-next-line react/no-array-index-key
                      key={`row-${rowIndex}`}
                      className="border-b border-mineshaft-700 bg-mineshaft-900 last:border-b-0 hover:bg-mineshaft-800/50"
                    >
                      {headers.map((header) => (
                        <td key={header} className="p-2">
                          <HighlightText text={String(row[header] ?? "")} highlight={search} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="mt-2 flex items-center">
          <button
            type="button"
            className="cursor-pointer text-sm text-bunker-400 underline"
            onClick={(e) => {
              e.stopPropagation();
              setIsRawView((v) => !v);
            }}
          >
            {isRawView ? "View Formatted" : "View Raw"}
          </button>

          {parsedContent.total_rows !== undefined && (
            <div className="ml-auto text-right text-sm text-bunker-400">
              Total rows: {parsedContent.total_rows}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="font-mono break-all whitespace-pre-wrap">
      <HighlightText text={content} highlight={search} />
    </div>
  );
};
