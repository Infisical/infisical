import FileSaver from "file-saver";

export const downloadTxtFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  FileSaver.saveAs(blob, filename);
};

/**
 * Merges local secrets with imported secrets (local > later imports > earlier imports),
 * formats them as a .env file string, and triggers a download.
 * Personal overrides take precedence over shared secret values.
 */
export const downloadSecretEnvFile = (
  environment: string,
  localSecrets: {
    secretKey: string;
    secretValue?: string;
    secretComment?: string;
    type?: string;
  }[],
  importedSecrets: {
    secrets: { secretKey: string; secretValue?: string; secretComment?: string; type?: string }[];
  }[]
) => {
  const secretsPicked = new Set<string>();
  const secretsToDownload: { key: string; value: string; comment?: string }[] = [];

  // Build a map of personal override values (personal overrides take precedence)
  const personalOverrides = new Map<string, { value?: string }>();
  localSecrets.forEach((el) => {
    if (el.type === "personal") {
      personalOverrides.set(el.secretKey, { value: el.secretValue });
    }
  });
  importedSecrets.forEach((imp) => {
    imp.secrets.forEach((el) => {
      if (el.type === "personal") {
        personalOverrides.set(el.secretKey, { value: el.secretValue });
      }
    });
  });

  localSecrets.forEach((el) => {
    if (el.type === "personal") return;

    secretsPicked.add(el.secretKey);
    const override = personalOverrides.get(el.secretKey);
    secretsToDownload.push({
      key: el.secretKey,
      value: (override ? override.value : el.secretValue) ?? "",
      comment: el.secretComment
    });
  });

  for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
    for (let j = importedSecrets[i].secrets.length - 1; j >= 0; j -= 1) {
      const secret = importedSecrets[i].secrets[j];
      // eslint-disable-next-line no-continue
      if (secret.type === "personal") continue;

      if (!secretsPicked.has(secret.secretKey)) {
        const override = personalOverrides.get(secret.secretKey);
        secretsToDownload.push({
          key: secret.secretKey,
          value: (override ? override.value : secret.secretValue) ?? "",
          comment: secret.secretComment
        });
      }
      secretsPicked.add(secret.secretKey);
    }
  }

  const file = secretsToDownload
    .sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()))
    .reduce((prev, { key, comment, value }) => {
      const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const formattedValue = `"${escapedValue}"`;

      if (!comment) return `${prev}${key}=${formattedValue}\n`;

      const commentLines = comment
        .split("\n")
        .map((line) => (line.trim() ? `# ${line}` : "#"))
        .join("\n");

      return `${prev}${commentLines}\n${key}=${formattedValue}\n`;
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
