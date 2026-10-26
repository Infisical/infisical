import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CodeXmlIcon,
  EyeOffIcon,
  MessageSquareIcon,
  TagsIcon,
  WrapTextIcon
} from "lucide-react";

import { parsePastedSecrets } from "@app/components/utilities/parseSecrets";
import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { FieldError, FieldLabel } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline } from "@app/components/v4/ui/layout";
import { ScrollArea } from "@app/components/v4/ui/scroll-area";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@app/components/v4/ui/tabs";
import { Textarea } from "@app/components/v4/ui/textarea";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  buildFolderTree,
  flattenNestedJson,
  getNestedJsonObject,
  joinSecretPath,
  type TFolderNode
} from "@app/pages/secret-manager/OverviewPage/components/SecretDropzone/parseNestedJson";
import type { TParsedEnv } from "@app/pages/secret-manager/OverviewPage/components/SecretDropzone/types";

import { type Resource, type Secret, versionsOf } from "../../secrets-model";
import { user } from "../../shared";
import { environmentLabel, folderExists, LOCAL_ONLY, secretsAt } from "../flows/shared";
import type { OverlayHostProps } from "../row-actions/types";
import {
  buildInitialMatrixMap,
  mapCsvMatrix,
  MATRIX_ROWS,
  pickInnerSeparator,
  type SecretMatrixMap
} from "./csv-column-map";
import { type CsvData, parseSecretFile } from "./parse-secret-file";

import flowStyles from "../flows/flows.module.css";
import styles from "./import-secrets.module.css";

export type ParsedEnv = TParsedEnv;

export type ImportSecretsRequest = {
  step: "upload" | "paste";
  file?: File;
  parsed?: ParsedEnv;
};

type Props = OverlayHostProps & {
  request?: ImportSecretsRequest;
  onComplete?: (environments: string[]) => void;
};

type TReviewRow =
  | { type: "folder"; id: string; depth: number; node: TFolderNode }
  | { type: "secret"; id: string; depth: number; key: string; secretData: TParsedEnv[string] };

const MAX_BATCH_REQUEST_BYTES = 1024 * 1024;
const PASTE_SECRETS_FORM_ID = "import-paste-secrets-form";
const NONE = "none";
const mask = "••••••••••••••••••••••";
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const indent = (depth?: number) =>
  depth ? { paddingInlineStart: `calc(var(--v4-space-24) * ${depth})` } : undefined;

function MatrixRow({
  label,
  icon,
  hint,
  value,
  options,
  onChange
}: {
  label: string;
  icon: ReactNode;
  hint?: ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <Select
        label={`Import column for ${label.toLowerCase()}`}
        placeholder="Select an option..."
        value={value}
        options={options}
        onChange={onChange}
      />
      <span className={styles.arrow}>
        <Icon icon={ArrowRightIcon} size={16} />
      </span>
      <span className={styles.mapResult}>
        <Badge tone="soft" className={styles.mapBadge}>
          {icon}
          {label}
        </Badge>
        {hint && (
          <Tooltip wrap content={hint}>
            <span className={flowStyles.hint}>
              <Icon name="info" size={14} label={`About ${label.toLowerCase()}`} />
            </span>
          </Tooltip>
        )}
      </span>
    </>
  );
}

function PasteExamples() {
  return (
    <span className={styles.examples}>
      <span>
        <span>Example formats:</span>
        <br />
        <span className={styles.examplesNote}>
          Each entry&apos;s key becomes the secret name and its value becomes the secret value.
        </span>
      </span>
      <pre className={styles.examplesBlock}>
        <span className={styles.examplesNote}>{"// .json: { <secret-name>: <secret-value> }"}</span>
        {`\n${JSON.stringify(
          {
            DATABASE_URL: "postgres://user:pass@host:5432/db",
            API_KEY: "sk_live_abc123",
            NODE_ENV: "production"
          },
          null,
          2
        )}`}
      </pre>
      <pre className={styles.examplesBlock}>
        <span className={styles.examplesNote}># .env</span>
        {'\nAPP_NAME="example-service"\nAPP_VERSION="1.2.3"\nNODE_ENV="production"'}
      </pre>
      <pre className={styles.examplesBlock}>
        <span className={styles.examplesNote}># .yml</span>
        {"\nAPP_NAME: example-service\nAPP_VERSION: 1.2.3\nNODE_ENV: production"}
      </pre>
    </span>
  );
}

function ImportSecretsContent({
  request,
  scope,
  resources,
  onApply,
  onToast,
  onClose,
  onComplete
}: Props & { request: ImportSecretsRequest }) {
  const initialParsedSecrets = request.parsed;
  const [parsedSecrets, setParsedSecrets] = useState<TParsedEnv | null>(null);
  const [importMethod, setImportMethod] = useState(request.step);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteError, setPasteError] = useState<string>();
  const [isDragActive, setIsDragActive] = useState(false);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [matrixMap, setMatrixMap] = useState<SecretMatrixMap | null>(null);
  const [visibleSecretKeys, setVisibleSecretKeys] = useState<Set<string>>(new Set());
  const [shouldOverwrite, setShouldOverwrite] = useState(false);
  const [keyOverrides, setKeyOverrides] = useState<Record<string, string>>({});
  const [nestedJson, setNestedJson] = useState<Record<string, unknown> | null>(null);
  const [shouldImportNested, setShouldImportNested] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const environmentValues = scope.environments.map((environment) => environment.value);
  const [selectedEnvs, setSelectedEnvs] = useState(() =>
    scope.visibleEnvironments
      .map((environment) => environment.value)
      .filter((value) => environmentValues.includes(value))
  );

  const activeSecrets = initialParsedSecrets || parsedSecrets;

  const nestedImport = useMemo(
    () => (nestedJson && shouldImportNested ? flattenNestedJson(nestedJson) : null),
    [nestedJson, shouldImportNested]
  );
  const folderTree = useMemo(
    () => (nestedImport ? buildFolderTree(nestedImport) : null),
    [nestedImport]
  );

  const reviewRows = useMemo<TReviewRow[]>(() => {
    const toSecretRows = (secrets: TParsedEnv, depth: number, path?: string): TReviewRow[] =>
      Object.entries(secrets).map(([key, secretData]) => ({
        type: "secret",
        id: path ? `${path}:${key}` : key,
        depth,
        key,
        secretData
      }));
    if (!folderTree) return activeSecrets ? toSecretRows(activeSecrets, 0) : [];
    const toFolderRows = (node: TFolderNode, depth: number): TReviewRow[] => [
      { type: "folder", id: node.path, depth, node },
      ...(collapsedFolders.has(node.path)
        ? []
        : [
            ...toSecretRows(node.secrets, depth + 1, node.path),
            ...node.children.flatMap((child) => toFolderRows(child, depth + 1))
          ])
    ];
    return [
      ...toSecretRows(folderTree.secrets, 0, "/"),
      ...folderTree.children.flatMap((child) => toFolderRows(child, 0))
    ];
  }, [folderTree, activeSecrets, collapsedFolders]);

  const allSecretKeys = nestedImport
    ? Object.entries(nestedImport.secretsByPath).flatMap(([path, secrets]) =>
        Object.keys(secrets).map((key) => `${path}:${key}`)
      )
    : Object.keys(activeSecrets ?? {});
  const secretCount = allSecretKeys.length;
  const folderCount = nestedImport?.folderPaths.length ?? 0;
  const folderSummary = nestedImport ? ` across ${plural(folderCount, "folder")}` : "";
  const hasNestedErrors = Boolean(nestedImport?.errors.length);
  const areAllFoldersCollapsed = Boolean(
    nestedImport?.folderPaths.length &&
      nestedImport.folderPaths.every((path) => collapsedFolders.has(path))
  );
  const hasInvalidKey = activeSecrets
    ? Object.entries(activeSecrets).some(
        ([key, s]) => s.isFileSecret && !(keyOverrides[key] ?? key).trim()
      )
    : false;
  const isOverRequestLimit = useMemo(() => {
    if (!activeSecrets || nestedImport) return false;
    const payload = JSON.stringify({
      projectId: scope.project,
      environment: selectedEnvs.reduce(
        (longest, slug) => (slug.length > longest.length ? slug : longest),
        ""
      ),
      secretPath: scope.path,
      secrets: Object.entries(activeSecrets).map(([key, s]) => ({
        secretKey: keyOverrides[key] ?? key,
        secretValue: s.value,
        secretComment: s.comments.join("\n"),
        type: "shared",
        tagIds: s.tagSlugs?.map(() => "00000000-0000-0000-0000-000000000000"),
        secretMetadata: s.secretMetadata,
        skipMultilineEncoding: s.skipMultilineEncoding
      }))
    });
    return new TextEncoder().encode(payload).length > MAX_BATCH_REQUEST_BYTES;
  }, [activeSecrets, keyOverrides, nestedImport, scope.project, scope.path, selectedEnvs]);

  const toastError = useCallback((title: string) => onToast("bad", { title }), [onToast]);

  const handleParsedSecrets = useCallback(
    (env: TParsedEnv, jsonSource?: string) => {
      if (!Object.keys(env).length) {
        toastError("No secrets found in the provided data.");
        return;
      }
      setParsedSecrets(env);
      setNestedJson(getNestedJsonObject(jsonSource));
    },
    [toastError]
  );

  const parseFile = useCallback(
    (file?: File) => {
      if (!file) {
        toastError(
          "You can't inject files from VS Code. Click 'Reveal in finder', and drag your file directly from the directory where it's located."
        );
        return;
      }
      const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
      if (!isCsv && file.size > MAX_BATCH_REQUEST_BYTES) {
        toastError("This file exceeds the 1 MB upload limit. Split it into smaller files.");
        return;
      }
      parseSecretFile(file, {
        onParsedSecrets: handleParsedSecrets,
        onCsvData: (data) => {
          setCsvData(data);
          setMatrixMap(buildInitialMatrixMap(data.headers));
        },
        onError: toastError
      });
    },
    [handleParsedSecrets, toastError]
  );

  const handledFile = useRef<File>(undefined);
  useEffect(() => {
    if (!request.file || handledFile.current === request.file) return;
    handledFile.current = request.file;
    parseFile(request.file);
  }, [request.file, parseFile]);

  const submitPaste = () => {
    const value = pasteValue.trim();
    const env = parsePastedSecrets(value);
    if (!Object.keys(env).length) {
      setPasteError("No secrets found. Please make sure the provided format is valid.");
      pasteRef.current?.focus();
      return;
    }
    setPasteValue("");
    setPasteError(undefined);
    handleParsedSecrets(env, value);
  };

  const confirmMapping = () => {
    if (!csvData || !matrixMap) return;
    if (!csvData.matrix.length) {
      toastError("Invalid secret matrix.");
      return;
    }
    const innerSeparator = pickInnerSeparator(csvData.delimiter);
    const { env, malformedMetadataRows } = mapCsvMatrix(csvData.matrix, matrixMap, innerSeparator);
    if (malformedMetadataRows > 0)
      onToast("neutral", {
        title: `Skipped malformed metadata in ${plural(malformedMetadataRows, "row")}`,
        description: `Expected format: key=value${innerSeparator}key=value`
      });
    setCsvData(null);
    setMatrixMap(null);
    handleParsedSecrets(env);
  };

  const toggleSet = (setter: typeof setVisibleSecretKeys, key: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const areAllVisible =
    allSecretKeys.length > 0 && allSecretKeys.every((key) => visibleSecretKeys.has(key));

  const handleBack = () => {
    setParsedSecrets(null);
    setNestedJson(null);
    setShouldImportNested(false);
    setCollapsedFolders(new Set());
    setVisibleSecretKeys(new Set());
    setKeyOverrides({});
  };

  const handleImport = () => {
    if (!activeSecrets || !selectedEnvs.length) return;
    const timestamp = new Date().toISOString();
    const writes = nestedImport
      ? Object.entries(nestedImport.secretsByPath).map(([path, secrets]) => ({
          path: joinSecretPath(scope.path, path),
          secrets
        }))
      : [{ path: scope.path, secrets: activeSecrets }];
    const folderPaths = [
      ...(scope.path === "/" ? [] : [scope.path]),
      ...(nestedImport?.folderPaths.map((path) => joinSecretPath(scope.path, path)) ?? [])
    ];
    const plan = (current: readonly Resource[]) => {
      const next = [...current];
      const counts = { created: 0, updated: 0, skipped: 0 };
      selectedEnvs.forEach((environment) => {
        folderPaths.forEach((path) => {
          if (folderExists(next, scope.project, environment, path)) return;
          const segments = path.split("/").filter(Boolean);
          next.push({
            kind: "folder",
            id: crypto.randomUUID(),
            project: scope.project,
            environment,
            path: `/${segments.slice(0, -1).join("/")}`,
            name: segments.at(-1) ?? "",
            description: "",
            createdAt: timestamp,
            updatedAt: timestamp
          });
        });
        writes.forEach(({ path, secrets }) => {
          const existing = new Map(
            secretsAt(next, scope.project, environment, path).map((secret) => [secret.name, secret])
          );
          Object.entries(secrets).forEach(([key, data]) => {
            const name = (data.isFileSecret ? (keyOverrides[key] ?? key) : key).trim();
            const comment = data.comments.join("\n");
            const metadata = data.secretMetadata?.map((entry) => ({ ...entry, encrypted: false }));
            const multiline =
              data.skipMultilineEncoding === undefined
                ? {}
                : { skipMultilineEncoding: data.skipMultilineEncoding };
            const match = existing.get(name);
            if (!match) {
              const created: Secret = {
                kind: "secret",
                id: crypto.randomUUID(),
                project: scope.project,
                environment,
                path,
                name,
                value: { status: "present", value: data.value },
                comment,
                tags: data.tagSlugs ?? [],
                metadata: metadata ?? [],
                version: 1,
                createdAt: timestamp,
                updatedAt: timestamp,
                ...multiline
              };
              next.push(created);
              existing.set(name, created);
              counts.created += 1;
              return;
            }
            if (!shouldOverwrite) {
              counts.skipped += 1;
              return;
            }
            const version = match.version + 1;
            const updated: Secret = {
              ...match,
              value: { status: "present", value: data.value },
              version,
              updatedAt: timestamp,
              versions: [
                {
                  version,
                  value: data.value,
                  createdAt: timestamp,
                  actor: user.name,
                  actorType: "user"
                },
                ...versionsOf(match)
              ],
              ...(comment ? { comment } : {}),
              ...(data.tagSlugs?.length ? { tags: data.tagSlugs } : {}),
              ...(metadata?.length ? { metadata } : {}),
              ...multiline
            };
            next[next.indexOf(match)] = updated;
            existing.set(name, updated);
            counts.updated += 1;
          });
        });
      });
      return { next, counts };
    };
    const { counts } = plan(resources);
    const environmentNames = selectedEnvs.map(environmentLabel).join(", ");
    const outcome = [
      counts.created && `${plural(counts.created, "secret")} created`,
      counts.updated && `${counts.updated} updated`,
      counts.skipped &&
        `${counts.skipped} skipped because ${counts.skipped === 1 ? "it already exists" : "they already exist"}`
    ]
      .filter(Boolean)
      .join(", ");
    if (counts.created || counts.updated || (nestedImport && folderCount)) {
      onApply((current) => plan(current).next, {
        title: `Uploaded ${plural(secretCount, "secret")}${folderSummary} into ${environmentNames}`,
        description: `${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}. ${LOCAL_ONLY}`
      });
    } else {
      onToast("neutral", {
        title: `No secrets uploaded into ${environmentNames}`,
        description: `${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}. Turn on overwrite existing secrets to update them.`
      });
    }
    onClose();
    onComplete?.(selectedEnvs);
  };

  if (csvData && matrixMap) {
    const innerSeparator = pickInnerSeparator(csvData.delimiter);
    const headerOptions = csvData.headers.map((header, col) => ({
      value: col.toString(),
      label: header
    }));
    return (
      <SheetContent className={styles.sheet}>
        <SheetHeader>
          <SheetTitle>Import column mapping</SheetTitle>
          <SheetDescription>
            Map your data columns to different parts of the secret.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className={styles.mapGrid}>
            <span className={flowStyles.labelRow}>
              <FieldLabel>Import column</FieldLabel>
            </span>
            <span />
            <span className={flowStyles.labelRow}>
              <FieldLabel>Resulting import</FieldLabel>
            </span>
            {MATRIX_ROWS.map((row) => (
              <MatrixRow
                key={row.mapKey}
                label={row.label}
                icon={row.icon}
                hint={row.hint?.(innerSeparator, csvData.delimiter)}
                value={matrixMap[row.mapKey]?.toString() ?? NONE}
                options={
                  row.mapKey === "key"
                    ? headerOptions
                    : [{ value: NONE, label: "None" }, ...headerOptions]
                }
                onChange={(value) =>
                  setMatrixMap(
                    (current) =>
                      current && {
                        ...current,
                        [row.mapKey]: value === NONE ? null : parseInt(value, 10)
                      }
                  )
                }
              />
            ))}
          </div>
        </SheetBody>
        <SheetFooter>
          <Inline justify="between">
            <Button
              variant="outline"
              onClick={() => {
                setCsvData(null);
                setMatrixMap(null);
              }}
            >
              Back
            </Button>
            <Button onClick={confirmMapping}>Confirm mapping</Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    );
  }

  if (!activeSecrets) {
    return (
      <SheetContent className={styles.sheet}>
        <SheetHeader>
          <SheetTitle className={styles.srOnly}>Upload secrets</SheetTitle>
          <SheetDescription className={styles.srOnly}>
            Upload a file or paste secret values, then review them before uploading.
          </SheetDescription>
          <Tabs
            value={importMethod}
            onValueChange={(value) => setImportMethod(value as "upload" | "paste")}
          >
            <TabsList aria-label="Secret import method">
              <TabsTrigger value="upload">Upload file</TabsTrigger>
              <TabsTrigger value="paste">Paste secrets</TabsTrigger>
            </TabsList>
          </Tabs>
        </SheetHeader>
        <SheetBody>
          <div hidden={importMethod !== "upload"}>
            <div
              className={styles.dropzone}
              data-dragging={isDragActive || undefined}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragActive(false);
                parseFile(event.dataTransfer.files[0]);
              }}
            >
              <span className={styles.dropzoneMedia}>
                <Icon name="upload" size={20} />
              </span>
              <span className={styles.dropzoneTitle}>
                {isDragActive ? (
                  "Drop your file here"
                ) : (
                  <>
                    Drag & drop or <span className={styles.dropzoneAccent}>choose file</span> to
                    upload
                  </>
                )}
              </span>
              <span>.env, .json, .yml, .csv, .pfx, .pem, or .crt (1 MB request limit)</span>
              <input
                type="file"
                aria-label="Choose file to upload"
                className={styles.dropzoneInput}
                accept=".txt,.env,.yml,.yaml,.json,.csv,.pfx,.pem,.crt"
                onChange={(event) => {
                  const { currentTarget } = event;
                  parseFile(currentTarget.files?.[0]);
                  currentTarget.value = "";
                }}
              />
            </div>
          </div>
          <form
            id={PASTE_SECRETS_FORM_ID}
            hidden={importMethod !== "paste"}
            className={styles.pasteForm}
            onSubmit={(event) => {
              event.preventDefault();
              submitPaste();
            }}
          >
            <span className={flowStyles.labelRow}>
              <FieldLabel htmlFor="import-paste-secrets">Secret values</FieldLabel>
              <Tooltip wrap content={<PasteExamples />}>
                <span className={flowStyles.hint}>
                  <Icon name="info" size={14} label="Example formats" />
                </span>
              </Tooltip>
            </span>
            <Textarea
              ref={pasteRef}
              id="import-paste-secrets"
              className={styles.pasteArea}
              value={pasteValue}
              aria-invalid={Boolean(pasteError) || undefined}
              placeholder="Paste secrets in .json, .yml or .env format..."
              spellCheck={false}
              onChange={(event) => {
                setPasteValue(event.target.value);
                setPasteError(undefined);
              }}
            />
            {pasteError && <FieldError>{pasteError}</FieldError>}
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {importMethod === "paste" && (
              <Button type="submit" form={PASTE_SECRETS_FORM_ID} disabled={!pasteValue}>
                Parse secrets
              </Button>
            )}
          </Inline>
        </SheetFooter>
      </SheetContent>
    );
  }

  return (
    <SheetContent className={styles.sheet}>
      <SheetHeader>
        <SheetTitle>Review & upload secrets</SheetTitle>
        <SheetDescription>
          {`${plural(secretCount, "secret")} found${folderSummary}. Select environments to upload to.`}
        </SheetDescription>
        {isOverRequestLimit && (
          <p className={styles.limitError}>
            These secrets exceed the 1 MB upload limit. Split them into smaller uploads.
          </p>
        )}
      </SheetHeader>
      <SheetBody>
        <div className={styles.review}>
          {hasNestedErrors && (
            <Alert tone="bad" title="Some keys cannot be imported">
              <ul className={styles.errorList}>
                {nestedImport?.errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </Alert>
          )}
          <ScrollArea className={styles.tableFrame}>
            <Table className={styles.reviewTable}>
              <TableHeader>
                <TableRow>
                  <TableHead className={styles.halfColumn}>
                    {folderTree && folderTree.children.length > 0 ? (
                      <button
                        type="button"
                        className={styles.headButton}
                        aria-label={
                          areAllFoldersCollapsed
                            ? "Key: expand all folders"
                            : "Key: collapse all folders"
                        }
                        onClick={() =>
                          setCollapsedFolders(
                            areAllFoldersCollapsed
                              ? new Set()
                              : new Set(nestedImport?.folderPaths ?? [])
                          )
                        }
                      >
                        Key
                        <Icon
                          icon={areAllFoldersCollapsed ? ChevronsUpDownIcon : ChevronsDownUpIcon}
                          size={14}
                        />
                      </button>
                    ) : (
                      "Key"
                    )}
                  </TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className={styles.actionColumn}>
                    <Tooltip
                      content={
                        areAllVisible ? "Hide all secret values" : "Reveal all secret values"
                      }
                    >
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        iconOnly
                        onClick={() =>
                          setVisibleSecretKeys(areAllVisible ? new Set() : new Set(allSecretKeys))
                        }
                      >
                        {areAllVisible ? <Icon icon={EyeOffIcon} /> : <Icon name="eye" />}
                        <span className={styles.srOnly}>
                          {areAllVisible ? "Hide all secret values" : "Reveal all secret values"}
                        </span>
                      </Button>
                    </Tooltip>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewRows.map((row) => {
                  if (row.type === "folder") {
                    const { node } = row;
                    const isExpanded = !collapsedFolders.has(node.path);
                    return (
                      <TableRow
                        key={row.id}
                        className={styles.folderRow}
                        aria-expanded={isExpanded}
                      >
                        <TableCell>
                          <div className={styles.keyCell} style={indent(row.depth)}>
                            <button
                              type="button"
                              className={styles.folderButton}
                              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
                              data-expanded={isExpanded || undefined}
                              onClick={() => toggleSet(setCollapsedFolders, node.path)}
                            >
                              <span className={styles.glyph}>
                                {isExpanded ? (
                                  <Icon name="folder-open" size={14} />
                                ) : (
                                  <>
                                    <Icon name="folder" size={14} className={styles.closedFolder} />
                                    <Icon name="chev-right" size={14} className={styles.chevron} />
                                  </>
                                )}
                              </span>
                              <span className={`${styles.truncate} ${styles.mono}`}>
                                {node.name}
                              </span>
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={`${styles.truncate} ${styles.mono} ${styles.muted}`}>
                            {joinSecretPath(scope.path, node.path)}
                          </div>
                        </TableCell>
                        <TableCell className={styles.actionColumn}>
                          <Tooltip
                            content={`${plural(node.secretCount, "secret")}, including subfolders`}
                          >
                            <button type="button" className={styles.countButton}>
                              {plural(node.secretCount, "secret")}
                            </button>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const { id, key, secretData } = row;
                  const isVisible = visibleSecretKeys.has(id);
                  const editedKey = keyOverrides[key] ?? key;
                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <div
                          className={styles.keyCell}
                          style={folderTree ? indent(row.depth) : undefined}
                        >
                          <span className={styles.glyph}>
                            <Icon name="key" size={14} />
                          </span>
                          {secretData.isFileSecret ? (
                            <Input
                              className={styles.keyInput}
                              aria-label={`Secret key for ${key}`}
                              value={editedKey}
                              invalid={!editedKey.trim()}
                              placeholder="Secret key"
                              autoComplete="off"
                              spellCheck={false}
                              onChange={(event) =>
                                setKeyOverrides((prev) => ({ ...prev, [key]: event.target.value }))
                              }
                            />
                          ) : (
                            <span className={`${styles.truncate} ${styles.mono}`}>{key}</span>
                          )}
                          {secretData.comments.some(Boolean) && (
                            <Tooltip
                              wrap
                              content={
                                <span className={styles.preWrap}>
                                  {secretData.comments.join("\n")}
                                </span>
                              }
                            >
                              <span className={styles.glyph}>
                                <Icon icon={MessageSquareIcon} size={14} label="Comment" />
                              </span>
                            </Tooltip>
                          )}
                          {Boolean(secretData.tagSlugs?.length) && (
                            <Tooltip
                              wrap
                              content={
                                <span className={`${styles.tooltipList} ${styles.mono}`}>
                                  {secretData.tagSlugs?.map((slug) => (
                                    <span key={slug}>{slug}</span>
                                  ))}
                                </span>
                              }
                            >
                              <span className={styles.glyph}>
                                <Icon icon={TagsIcon} size={14} label="Tags" />
                              </span>
                            </Tooltip>
                          )}
                          {Boolean(secretData.secretMetadata?.length) && (
                            <Tooltip
                              wrap
                              content={
                                <span className={`${styles.tooltipList} ${styles.mono}`}>
                                  {secretData.secretMetadata?.map((entry) => (
                                    <span key={entry.key}>{`${entry.key}=${entry.value}`}</span>
                                  ))}
                                </span>
                              }
                            >
                              <span className={styles.glyph}>
                                <Icon icon={CodeXmlIcon} size={14} label="Metadata" />
                              </span>
                            </Tooltip>
                          )}
                          {secretData.skipMultilineEncoding === true && (
                            <Tooltip content="Multi-line encoding enabled">
                              <span className={styles.glyph}>
                                <Icon icon={WrapTextIcon} size={14} label="Multi-line encoding" />
                              </span>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`${styles.truncate} ${styles.mono} ${styles.valueCell}`}>
                          {isVisible
                            ? secretData.value || <span className={styles.muted}>EMPTY</span>
                            : mask}
                        </div>
                      </TableCell>
                      <TableCell className={styles.actionColumn}>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          iconOnly
                          onClick={() => toggleSet(setVisibleSecretKeys, id)}
                        >
                          {isVisible ? <Icon icon={EyeOffIcon} /> : <Icon name="eye" />}
                          <span className={styles.srOnly}>
                            {`${isVisible ? "Hide" : "Reveal"} ${key}`}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
          <div className={flowStyles.valueField}>
            <span className={flowStyles.labelRow}>
              <FieldLabel htmlFor="import-target-environments">Target environments</FieldLabel>
              <Tooltip content="The environments the secrets should be added to">
                <span className={flowStyles.hint}>
                  <Icon name="info" size={14} label="About target environments" />
                </span>
              </Tooltip>
            </span>
            <Combobox
              id="import-target-environments"
              label="Target environments"
              multiple
              options={scope.environments}
              value={selectedEnvs}
              placeholder="Select environments to upload to..."
              onValueChange={setSelectedEnvs}
            />
          </div>
          <span className={flowStyles.labelRow}>
            <FieldLabel htmlFor="import-overwrite-existing">Overwrite existing secrets</FieldLabel>
            <Tooltip
              wrap
              content="When enabled, secrets that already exist in the target environment will be updated with the imported values. When disabled, existing secrets will be skipped and only new secrets will be created."
            >
              <span className={flowStyles.hint}>
                <Icon name="info" size={14} label="About overwriting existing secrets" />
              </span>
            </Tooltip>
            <Switch
              id="import-overwrite-existing"
              checked={shouldOverwrite}
              onCheckedChange={setShouldOverwrite}
            />
          </span>
          {nestedJson && (
            <span className={flowStyles.labelRow}>
              <FieldLabel htmlFor="import-nested-as-folders">
                Import nested objects as folders
              </FieldLabel>
              <Tooltip
                wrap
                content={`Each nested object becomes a folder relative to ${scope.path}, and its values become secrets in that folder. Arrays are stored as JSON strings, null as an empty value, and numbers and booleans as text.`}
              >
                <span className={flowStyles.hint}>
                  <Icon name="info" size={14} label="About importing nested objects" />
                </span>
              </Tooltip>
              <Switch
                id="import-nested-as-folders"
                checked={shouldImportNested}
                onCheckedChange={setShouldImportNested}
              />
            </span>
          )}
        </div>
      </SheetBody>
      <SheetFooter>
        <Inline gap={8} justify="end">
          {!initialParsedSecrets && (
            <Button variant="outline" className={styles.push} onClick={handleBack}>
              Back
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !selectedEnvs.length || hasInvalidKey || isOverRequestLimit || hasNestedErrors
            }
            onClick={handleImport}
          >
            {`Upload ${plural(secretCount, "secret")}`}
          </Button>
        </Inline>
      </SheetFooter>
    </SheetContent>
  );
}

export function ImportSecretsSheet(props: Props) {
  const { request, onClose } = props;
  const [shown, setShown] = useState(request);
  const [session, setSession] = useState(0);
  if (request && request !== shown) {
    setShown(request);
    setSession((current) => current + 1);
  }
  return (
    <Sheet
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {shown && <ImportSecretsContent key={session} {...props} request={shown} />}
    </Sheet>
  );
}
