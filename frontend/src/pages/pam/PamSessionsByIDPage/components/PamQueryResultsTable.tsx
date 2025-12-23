import { Table, TBody, Td, Th, THead, Tr } from "@app/components/v2";

type Props = {
  rows: Array<Array<any>>;
  rowCount: number;
};

export const PamQueryResultsTable = ({ rows, rowCount }: Props) => {
  if (rowCount === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-mineshaft-700 bg-mineshaft-800 p-8 text-bunker-300">
        No rows returned
      </div>
    );
  }

  const columnCount = rows[0]?.length || 0;

  return (
    <div className="max-h-[500px] overflow-auto rounded-md border border-mineshaft-700">
      {/* eslint-disable react/no-array-index-key */}
      <Table>
        <THead className="sticky top-0 z-10 bg-mineshaft-900">
          <Tr>
            {Array.from({ length: columnCount }).map((_, i) => (
              <Th key={`col-${i}`} className="text-xs">
                Column {i + 1}
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {rows.map((row, rowIndex) => (
            <Tr key={`row-${rowIndex}`} className="hover:bg-mineshaft-700">
              {row.map((cell, cellIndex) => (
                <Td key={`cell-${rowIndex}-${cellIndex}`} className="font-mono text-xs">
                  {cell === null ? (
                    <span className="text-bunker-400 italic">NULL</span>
                  ) : (
                    <span className="text-bunker-100">{String(cell)}</span>
                  )}
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </Table>
      {/* eslint-enable react/no-array-index-key */}
    </div>
  );
};
