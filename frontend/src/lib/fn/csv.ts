/**
 * Converts a JSON array of objects to CSV format
 * @param {Array} jsonData - Array of objects to convert
 * @param {string} filename - Name of the file to download (without extension)
 */
export const convertJsonToCsv = (jsonData: Record<string, string | number | boolean>[]) => {
  // Get headers from the first object

  if (jsonData.length === 0) {
    return new Blob([""], { type: "text/csv;charset=utf-8;" });
  }

  const headers = Object.keys(jsonData[0]);

  const csvRows = [
    headers.join(","),
    // Add all data rows
    ...jsonData.map((row) => {
      return headers
        .map((header) => {
          // Handle special cases in the data
          let cell = row[header];

          // Convert null/undefined to empty string
          if (cell === null || cell === undefined) {
            return "";
          }

          // Handle normal values
          if (typeof cell === "number" || typeof cell === "boolean") {
            return cell;
          }

          // Convert objects/arrays to JSON string
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
