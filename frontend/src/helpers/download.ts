import FileSaver from "file-saver";

import { SecretType } from "@app/hooks/api/types";

export const downloadTxtFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  FileSaver.saveAs(blob, filename);
};

type SecretEnvFileSecret = {
  secretKey: string;
  secretValue?: string;
  secretComment?: string;
  secretPath?: string;
  type?: string;
};

type SecretEnvFileImport = {
  secretPath?: string;
  secrets: SecretEnvFileSecret[];
};

type SecretEnvFileOptions = {
  flattenFolders?: boolean;
};

export type SecretEnvFileEntry = {
  key: string;
  value: string;
  comment?: string;
  path?: string;
};

const getSecretEnvFileKey = (
  secret: SecretEnvFileSecret,
  fallbackPath: string | undefined,
  flattenFolders: boolean
) => {
  if (!flattenFolders) return secret.secretKey;

  const pathPrefix = (secret.secretPath ?? fallbackPath ?? "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase())
    .filter(Boolean)
    .join("_");

  return pathPrefix ? `${pathPrefix}_${secret.secretKey}` : secret.secretKey;
};

const normalizeSecretPath = (path?: string) => {
  const normalized = `/${(path ?? "/").split("/").filter(Boolean).join("/")}`;
  return normalized === "/" ? normalized : normalized.replace(/\/$/, "");
};

const getSecretIdentity = (secret: SecretEnvFileSecret, fallbackPath?: string) =>
  `${normalizeSecretPath(secret.secretPath ?? fallbackPath)}\u0000${secret.secretKey}`;

const resolveFlattenedKeyCollisions = (entries: SecretEnvFileEntry[]) => {
  const entriesByStablePath = [...entries].sort((a, b) => {
    const pathComparison = normalizeSecretPath(a.path).localeCompare(normalizeSecretPath(b.path));
    return pathComparison || a.key.localeCompare(b.key);
  });
  const reservedKeys = new Set(entriesByStablePath.map(({ key }) => key));
  const usedKeys = new Set<string>();

  return entriesByStablePath.map((entry) => {
    if (!usedKeys.has(entry.key)) {
      usedKeys.add(entry.key);
      return entry;
    }

    let suffix = 2;
    let key = `${entry.key}_${suffix}`;
    while (usedKeys.has(key) || reservedKeys.has(key)) {
      suffix += 1;
      key = `${entry.key}_${suffix}`;
    }
    usedKeys.add(key);

    return { ...entry, key };
  });
};

export const getSecretEnvFileEntries = (
  localSecrets: SecretEnvFileSecret[],
  importedSecrets: SecretEnvFileImport[],
  { flattenFolders = false }: SecretEnvFileOptions = {}
) => {
  const secretsPicked = new Set<string>();
  const secretsToExport: SecretEnvFileEntry[] = [];

  const personalOverrides = new Map<string, { value?: string }>();
  localSecrets.forEach((secret) => {
    if (secret.type === SecretType.Personal) {
      personalOverrides.set(getSecretIdentity(secret), {
        value: secret.secretValue
      });
    }
  });
  importedSecrets.forEach((secretImport) => {
    secretImport.secrets.forEach((secret) => {
      if (secret.type === SecretType.Personal) {
        personalOverrides.set(getSecretIdentity(secret, secretImport.secretPath), {
          value: secret.secretValue
        });
      }
    });
  });

  localSecrets.forEach((secret) => {
    if (secret.type === SecretType.Personal) return;

    const identity = getSecretIdentity(secret);
    if (secretsPicked.has(identity)) return;

    const key = getSecretEnvFileKey(secret, undefined, flattenFolders);
    secretsPicked.add(identity);
    const override = personalOverrides.get(identity);
    secretsToExport.push({
      key,
      value: (override ? override.value : secret.secretValue) ?? "",
      comment: secret.secretComment,
      path: secret.secretPath
    });
  });

  for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
    for (let j = importedSecrets[i].secrets.length - 1; j >= 0; j -= 1) {
      const secret = importedSecrets[i].secrets[j];
      // eslint-disable-next-line no-continue
      if (secret.type === SecretType.Personal) continue;

      const identity = getSecretIdentity(secret, importedSecrets[i].secretPath);
      const key = getSecretEnvFileKey(secret, importedSecrets[i].secretPath, flattenFolders);
      if (!secretsPicked.has(identity)) {
        const override = personalOverrides.get(identity);
        secretsToExport.push({
          key,
          value: (override ? override.value : secret.secretValue) ?? "",
          comment: secret.secretComment,
          path: secret.secretPath ?? importedSecrets[i].secretPath
        });
      }
      secretsPicked.add(identity);
    }
  }

  const resolvedSecrets = flattenFolders
    ? resolveFlattenedKeyCollisions(secretsToExport)
    : secretsToExport;

  return resolvedSecrets.sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()));
};

/**
 * Merges local secrets with imported secrets (local > later imports > earlier imports)
 * and formats them as a .env file string. Personal overrides take precedence over
 * shared secret values.
 */
export const formatSecretEnvFile = (
  localSecrets: SecretEnvFileSecret[],
  importedSecrets: SecretEnvFileImport[],
  options?: SecretEnvFileOptions
) =>
  getSecretEnvFileEntries(localSecrets, importedSecrets, options).reduce(
    (file, { key, comment, value }) => {
      const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const formattedValue = `"${escapedValue}"`;

      if (!comment) return `${file}${key}=${formattedValue}\n`;

      const commentLines = comment
        .split("\n")
        .map((line) => (line.trim() ? `# ${line}` : "#"))
        .join("\n");

      return `${file}${commentLines}\n${key}=${formattedValue}\n`;
    },
    ""
  );

/**
 * Merges local secrets with imported secrets (local > later imports > earlier imports),
 * formats them as a .env file string, and triggers a download.
 * Personal overrides take precedence over shared secret values.
 */
export const downloadSecretEnvFile = (
  environment: string,
  localSecrets: SecretEnvFileSecret[],
  importedSecrets: SecretEnvFileImport[],
  options?: SecretEnvFileOptions
) => {
  downloadTxtFile(
    `${environment}.env`,
    formatSecretEnvFile(localSecrets, importedSecrets, options)
  );
};

const getZipEnvFilePath = (secretPath: string) => {
  const safeSegments = normalizeSecretPath(secretPath)
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== "." && segment !== "..")
    .map((segment) => segment.replace(/\\/g, "_"));

  return safeSegments.length ? `${safeSegments.join("/")}/.env` : ".env";
};

export const getSecretEnvironmentZipFiles = (
  localSecrets: SecretEnvFileSecret[],
  importedSecrets: SecretEnvFileImport[]
) => {
  const localSecretsByPath = new Map<string, SecretEnvFileSecret[]>();
  const importsByPath = new Map<string, SecretEnvFileImport[]>();

  localSecrets.forEach((secret) => {
    const path = normalizeSecretPath(secret.secretPath);
    localSecretsByPath.set(path, [...(localSecretsByPath.get(path) ?? []), secret]);
  });

  importedSecrets.forEach((secretImport) => {
    const secretsByPath = new Map<string, SecretEnvFileSecret[]>();
    secretImport.secrets.forEach((secret) => {
      const path = normalizeSecretPath(secret.secretPath ?? secretImport.secretPath);
      secretsByPath.set(path, [...(secretsByPath.get(path) ?? []), secret]);
    });
    secretsByPath.forEach((secrets, path) => {
      importsByPath.set(path, [
        ...(importsByPath.get(path) ?? []),
        { ...secretImport, secretPath: path, secrets }
      ]);
    });
  });

  const paths = new Set([...localSecretsByPath.keys(), ...importsByPath.keys()]);
  return Object.fromEntries(
    [...paths]
      .sort((a, b) => a.localeCompare(b))
      .map((path) => [
        getZipEnvFilePath(path),
        formatSecretEnvFile(localSecretsByPath.get(path) ?? [], importsByPath.get(path) ?? [])
      ])
      .filter(([, content]) => Boolean(content))
  );
};

/* eslint-disable no-bitwise -- CRC-32 is defined in terms of bitwise polynomial operations. */
const ZIP_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const getZipCrc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  data.forEach((byte) => {
    crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
};
/* eslint-enable no-bitwise */

const mergeUint8Arrays = (arrays: Uint8Array[]) => {
  const output = new Uint8Array(arrays.reduce((length, array) => length + array.length, 0));
  let offset = 0;
  arrays.forEach((array) => {
    output.set(array, offset);
    offset += array.length;
  });
  return output;
};

export const createZipArchive = (files: Record<string, string>) => {
  const encoder = new TextEncoder();
  const localFiles: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let localOffset = 0;

  Object.entries(files).forEach(([filePath, content]) => {
    const name = encoder.encode(filePath);
    const data = encoder.encode(content);
    const crc = getZipCrc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localHeader.set(name, 30);
    localFiles.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(name, 46);
    centralDirectory.push(centralHeader);

    localOffset += localHeader.length + data.length;
  });

  const centralDirectorySize = centralDirectory.reduce(
    (length, header) => length + header.length,
    0
  );
  const endOfCentralDirectory = new Uint8Array(22);
  const endView = new DataView(endOfCentralDirectory.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralDirectory.length, true);
  endView.setUint16(10, centralDirectory.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, localOffset, true);

  return mergeUint8Arrays([...localFiles, ...centralDirectory, endOfCentralDirectory]);
};

export const downloadZipFile = (filename: string, files: Record<string, string>) => {
  const archive = createZipArchive(files);
  FileSaver.saveAs(new Blob([archive], { type: "application/zip" }), filename);
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
