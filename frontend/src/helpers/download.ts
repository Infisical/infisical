import FileSaver from "file-saver";

export const downloadTxtFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  FileSaver.saveAs(blob, filename);
};

/**
 * Merges local secrets with imported secrets (local > later imports > earlier imports),
 * formats them as a .env file string, and triggers a download.
 */
export const downloadSecretEnvFile = (
  environment: string,
  localSecrets: { secretKey: string; secretValue?: string; secretComment?: string }[],
  importedSecrets: {
    secrets: { secretKey: string; secretValue?: string; secretComment?: string }[];
  }[]
) => {
  const secretsPicked = new Set<string>();
  const secretsToDownload: { key: string; value: string; comment?: string }[] = [];

  localSecrets.forEach((el) => {
    secretsPicked.add(el.secretKey);
    secretsToDownload.push({
      key: el.secretKey,
      value: el.secretValue ?? "",
      comment: el.secretComment
    });
  });

  for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
    for (let j = importedSecrets[i].secrets.length - 1; j >= 0; j -= 1) {
      const secret = importedSecrets[i].secrets[j];
      if (!secretsPicked.has(secret.secretKey)) {
        secretsToDownload.push({
          key: secret.secretKey,
          value: secret.secretValue ?? "",
          comment: secret.secretComment
        });
      }
      secretsPicked.add(secret.secretKey);
    }
  }

  const file = secretsToDownload
    .sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()))
    .reduce((prev, { key, comment, value }, index) => {
      const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      const formattedValue = `"${escapedValue}"`;

      if (!comment) return `${prev}${key}=${formattedValue}\n`;

      const commentLines = comment
        .split("\n")
        .map((line) => (line.trim() ? `# ${line}` : "#"))
        .join("\n");

      return `${prev}${index === 0 ? "" : "\n"}${commentLines}\n${key}=${formattedValue}\n`;
    }, "");

  downloadTxtFile(`${environment}.env`, file);
};

export const downloadFile = (content: string, filename: string, mimeType: string = "text/csv") => {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
