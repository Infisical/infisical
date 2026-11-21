import {
  type CsvDelimiter,
  parseCsvToMatrix,
  parseDotEnv,
  parseJson,
  parseYaml
} from "@app/components/utilities/parseSecrets";
import type { TParsedEnv } from "@app/pages/secret-manager/OverviewPage/components/SecretDropzone/types";

export type CsvData = {
  headers: string[];
  matrix: string[][];
  delimiter: CsvDelimiter;
};

type ParseSecretFileOptions = {
  onParsedSecrets: (env: TParsedEnv, jsonSource?: string) => void;
  onCsvData: (data: CsvData) => void;
  onError: (message: string) => void;
};

// Main's parseSecretFile raises its errors through the v3 notification store, so this keeps its
// branching and hands each message to the caller instead.
const parseCertificateFile = (
  file: File,
  extension: string,
  { onParsedSecrets, onError }: Pick<ParseSecretFileOptions, "onParsedSecrets" | "onError">
) => {
  const reader = new FileReader();
  reader.onerror = () => onError("Failed to read file.");
  reader.onload = (event) => {
    if (!event?.target?.result) {
      onError("Invalid file contents.");
      return;
    }
    const result = event.target.result as string;
    onParsedSecrets({
      [file.name]: {
        value: extension === "pfx" ? result.slice(result.indexOf(",") + 1) : result,
        comments: [],
        isFileSecret: true,
        skipMultilineEncoding: extension === "pem" || extension === "crt"
      }
    });
  };
  if (extension === "pfx") reader.readAsDataURL(file);
  else reader.readAsText(file);
};

export const parseSecretFile = (file: File, options: ParseSecretFileOptions) => {
  const { onParsedSecrets, onCsvData, onError } = options;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pfx" || extension === "pem" || extension === "crt") {
    parseCertificateFile(file, extension, options);
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => onError("Failed to read file.");
  reader.onload = (event) => {
    if (!event?.target?.result) {
      onError("Invalid file contents.");
      return;
    }
    const src = event.target.result as string;
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
        onParsedSecrets(parseJson(src), src);
        return;
      }
      if (extension === "csv" || file.type === "text/csv") {
        const { matrix, delimiter } = parseCsvToMatrix(src);
        if (!matrix.length) {
          onError("Failed to find secrets in CSV file. File might be empty.");
          return;
        }
        onCsvData({ headers: matrix[0], matrix: matrix.slice(1), delimiter });
        return;
      }
      onParsedSecrets(parseDotEnv(src));
    } catch (error) {
      onError(
        error instanceof Error
          ? `Failed to parse ${file.name}: ${error.message}`
          : `Failed to parse ${file.name}.`
      );
    }
  };
  reader.readAsText(file);
};
