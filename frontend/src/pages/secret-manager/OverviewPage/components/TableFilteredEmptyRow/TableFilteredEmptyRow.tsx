import { CSSProperties, useEffect, useRef, useState } from "react";

import { TableCell, TableRow } from "@app/components/v3";

import { EmptyResourceDisplay } from "../EmptyResourceDisplay";

type Props = {
  colSpan: number;
  isFiltered: boolean;
  hasSearch: boolean;
  onSearchAllFolders: () => void;
};

export const TableFilteredEmptyRow = ({
  colSpan,
  isFiltered,
  hasSearch,
  onSearchAllFolders
}: Props) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentStyle, setContentStyle] = useState<CSSProperties>();

  useEffect(() => {
    const content = contentRef.current;
    const tableContainer = content?.closest<HTMLElement>('[data-slot="table-container"]');
    if (!content || !tableContainer) return undefined;

    const updateContentWidth = () => {
      setContentStyle({ width: tableContainer.clientWidth });
    };

    updateContentWidth();

    const resizeObserver = new ResizeObserver(updateContentWidth);
    resizeObserver.observe(tableContainer);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-64 p-0 whitespace-normal">
        <div ref={contentRef} className="sticky left-0 h-full" style={contentStyle}>
          <EmptyResourceDisplay
            isTableRow
            isFiltered={isFiltered}
            hasSearch={hasSearch}
            onSearchAllFolders={onSearchAllFolders}
          />
        </div>
      </TableCell>
    </TableRow>
  );
};
