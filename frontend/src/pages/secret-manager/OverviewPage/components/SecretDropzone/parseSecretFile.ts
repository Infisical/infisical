import { createNotification } from "@app/components/notifications";
import {
  CsvDelimiter,
  parseCsvToMatrix,
  parseDotEnv,
  parseJson,
  parseYaml
} from "@app/components/utilities/parseSecrets";

import { TParsedEnv } from "./types";

export type CsvData = {
  headers: string[];
  matrix: string[][];
  delimiter: CsvDelimiter;
};

type ParseSecretFileOptions = {
  onParsedSecrets: (env: TParsedEnv) => void;
  onCsvData: (data: CsvData) => void;
};

// Certificate and key files are imported verbatim: the filename becomes the
// secret key and the file contents become the value. Binary PFX files are
// base64-encoded, while PEM and CRT files are stored as plain text.
const parseCertificateFile = (
  file: File,
  extension: string,
  onParsedSecrets: (env: TParsedEnv) => void
) => {
  const reader = new FileReader();

  reader.onerror = () => {
    createNotification({
      type: "error",
      text: "Failed to read file."
    });
  };

  reader.onload = (event) => {
    if (!event?.target?.result) {
      createNotification({
        type: "error",
        text: "Invalid file contents."
      });
      return;
    }

    const result = event.target.result as string;
    const value =
      extension === "pfx"
        ? // readAsDataURL yields "data:<mime>;base64,<data>", so keep only the base64 payload
          result.slice(result.indexOf(",") + 1)
        : result;

    const skipMultilineEncoding = extension === "pem" || extension === "crt";

    onParsedSecrets({
      [file.name]: {
        value,
        comments: [],
        isFileSecret: true,
        skipMultilineEncoding
      }
    });
  };

  try {
    if (extension === "pfx") {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  } catch (error) {
    console.log(error);
  }
};

export const parseSecretFile = (
  file: File | undefined,
  { onParsedSecrets, onCsvData }: ParseSecretFileOptions
) => {
  if (!file) {
    return;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pfx" || extension === "pem" || extension === "crt") {
    parseCertificateFile(file, extension, onParsedSecrets);
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    if (!event?.target?.result) {
      createNotification({
        type: "error",
        text: "Invalid file contents."
      });
      return;
    }

    const src = event.target.result as string;

    // Browsers frequently report an empty type for .yml/.yaml/.csv, so the extension
    // has to be considered too, otherwise the file falls through to the dotenv
    // parser and its contents get mangled.
    const isYaml =
      extension === "yml" ||
      extension === "yaml" ||
      file.type === "text/yaml" ||
      file.type === "application/x-yaml" ||
      file.type === "application/yaml";

    try {
      if (isYaml) {
        onParsedSecrets(parseYaml(src));
        return;
      }

      if (extension === "json" || file.type === "application/json") {
        onParsedSecrets(parseJson(src));
        return;
      }

      if (extension === "csv" || file.type === "text/csv") {
        const { matrix: fullMatrix, delimiter } = parseCsvToMatrix(src);
        if (!fullMatrix.length) {
          createNotification({
            type: "error",
            text: "Failed to find secrets in CSV file. File might be empty."
          });
          return;
        }
        onCsvData({ headers: fullMatrix[0], matrix: fullMatrix.slice(1), delimiter });
        return;
      }

      onParsedSecrets(parseDotEnv(src));
    } catch (error) {
      createNotification({
        type: "error",
        text:
          error instanceof Error
            ? `Failed to parse ${file.name}: ${error.message}`
            : `Failed to parse ${file.name}.`
      });
    }
  };

  try {
    reader.readAsText(file);
  } catch (error) {
    console.log(error);
  }
};
