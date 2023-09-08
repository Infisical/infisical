export const generateCSV = (data: Record<string, any>[]): string => {
  if (!Array.isArray(data) || data.length === 0) {
    return "";
  }

  const headers = Object.keys(data[0]);

  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((header) => JSON.stringify(row[header])).join(",")
    )
  ].join("\n");

  return csvContent;
};
