/**
 * Converts a JSON array of objects to CSV format
 * @param {Array} jsonData - Array of objects to convert
 */
export const convertJsonToCsv = (jsonData: Record<string, string | number | boolean>[]) => {
  if (jsonData.length === 0) {
    return new Blob([""], { type: "text/csv;charset=utf-8;" });
  }

  const headers = Object.keys(jsonData[0]);

  const csvRows = [
    headers.join(","),
    ...jsonData.map((row) => {
      return headers
        .map((header) => {
          let cell = row[header];

          if (cell === null || cell === undefined) {
            return "";
          }

          if (typeof cell === "number" || typeof cell === "boolean") {
            return cell;
          }

          if (typeof cell === "object") {
            cell = JSON.stringify(cell);
          }

          // Escape quotes and wrap in quotes
          cell = cell.toString().replace(/"/g, '""');
          return `"${cell}"`;
        })
        .join(",");
    })
  ].join("\n");

  return new Blob([csvRows], { type: "text/csv;charset=utf-8;" });
};
