/* eslint-disable no-nested-ternary */
import { useCallback, useRef, useState } from "react";
import { faChevronDown, faChevronUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { IconButton, Tooltip } from "@app/components/v2";

export interface Version {
  id?: string;
  version: number;
  [key: string]: any;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

export interface DiffViewItem {
  type: "secret" | "folder";
  isAdded?: boolean;
  isDeleted?: boolean;
  isUpdated?: boolean;
  versions?: Version[];
  isRollback?: boolean;
  id: string;
  secretKey?: string;
  folderName?: string;
}

interface SecretVersionDiffViewProps {
  item: DiffViewItem;
  isCollapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  showHeader?: boolean;
  customHeader?: JSX.Element;
  excludedFieldsHighlight?: string[];
  onDiscard?: VoidFunction;
}

const isObject = (obj: JsonValue): obj is JsonObject => {
  return obj !== null && typeof obj === "object" && !Array.isArray(obj);
};

const isArray = (obj: JsonValue): obj is JsonArray => {
  return Array.isArray(obj);
};

const deepEqual = (a: JsonValue, b: JsonValue): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item: JsonValue, index: number) => deepEqual(item, b[index]));
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => keysB.includes(key) && deepEqual(a[key], b[key]));
  }

  return false;
};

const getDiffPaths = (oldObj: JsonValue, newObj: JsonValue, path: string = ""): Set<string> => {
  const diffPaths = new Set<string>();

  if (oldObj === newObj) return diffPaths;

  if (oldObj == null || newObj == null) {
    diffPaths.add(path || "root");
    return diffPaths;
  }

  if (typeof oldObj !== typeof newObj) {
    diffPaths.add(path || "root");
    return diffPaths;
  }

  if (isArray(oldObj) && isArray(newObj)) {
    return diffPaths;
  }

  if (isObject(oldObj) && isObject(newObj)) {
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    allKeys.forEach((key) => {
      const currentPath = path ? `${path}.${key}` : key;

      if (path.includes("[")) {
        return;
      }

      if (!(key in oldObj) || !(key in newObj) || !deepEqual(oldObj[key], newObj[key])) {
        diffPaths.add(currentPath);

        if (
          key in oldObj &&
          key in newObj &&
          (isObject(oldObj[key]) || isArray(oldObj[key])) &&
          (isObject(newObj[key]) || isArray(newObj[key]))
        ) {
          const nestedDiffs = getDiffPaths(oldObj[key], newObj[key], currentPath);
          nestedDiffs.forEach((p) => diffPaths.add(p));
        }
      }
    });
    return diffPaths;
  }

  if (oldObj !== newObj) {
    diffPaths.add(path || "root");
  }

  return diffPaths;
};

const getNestedValue = (obj: JsonValue, path: string): JsonValue => {
  if (!path) return obj;

  const parts = path.split(/[.[\]]+/).filter(Boolean);
  let current: JsonValue = obj;

  parts.forEach((part) => {
    if (current == null) {
      return;
    }
    if (isObject(current)) {
      current = current[part];
    } else if (isArray(current)) {
      const index = parseInt(part, 10);
      if (!Number.isNaN(index)) {
        current = current[index];
      }
    }
  });

  return current;
};

const isPathDifferent = (jsonPath: string, diffPaths: Set<string>): boolean => {
  if (diffPaths.has(jsonPath)) return true;

  const diffPathsArray = Array.from(diffPaths);
  return diffPathsArray.some((diffPath) => {
    return (
      jsonPath.startsWith(`${diffPath}.`) ||
      jsonPath.startsWith(`${diffPath}[`) ||
      diffPath.startsWith(`${jsonPath}.`) ||
      diffPath.startsWith(`${jsonPath}[`)
    );
  });
};

const isContainerActuallyChanged = (
  path: string,
  diffPaths: Set<string>,
  oldObj: JsonValue,
  newObj: JsonValue
): boolean => {
  if (diffPaths.has(path)) {
    if (oldObj == null || newObj == null) return true;
    if (typeof oldObj !== typeof newObj) return true;
    if (isArray(oldObj) !== isArray(newObj)) return true;
    if (isObject(oldObj) !== isObject(newObj)) return true;

    if (!isObject(oldObj) && !isArray(oldObj)) return true;

    return false;
  }

  if (isArray(oldObj) && isArray(newObj)) {
    return false;
  }

  if (isObject(oldObj) && isObject(newObj)) {
    return false;
  }

  return oldObj !== newObj;
};

const renderJsonWithDiffs = (
  obj: JsonValue,
  diffPaths: Set<string>,
  isOldVersion: boolean,
  path: string = "",
  indentLevel: number = 0,
  keyName?: string,
  isLastItem: boolean = false,
  excludedFieldsHighlight: string[] = [],
  oldVersionObj?: JsonValue,
  newVersionObj?: JsonValue
): JSX.Element => {
  const indent = "  ".repeat(indentLevel);

  let isDifferent = false;

  if (path.includes("[") && oldVersionObj && newVersionObj) {
    const arrayMatch = path.match(/^([^[]+)\[(\d+)\]/);
    if (arrayMatch) {
      const arrayPath = arrayMatch[1];
      const itemIndex = parseInt(arrayMatch[2], 10);

      const oldArray = getNestedValue(oldVersionObj, arrayPath);
      const newArray = getNestedValue(newVersionObj, arrayPath);

      if (isArray(oldArray) && isArray(newArray)) {
        const currentItem = isOldVersion ? oldArray[itemIndex] : newArray[itemIndex];

        if (isOldVersion) {
          isDifferent = !newArray.some((newItem: JsonValue) => deepEqual(currentItem, newItem));
        } else {
          isDifferent = !oldArray.some((oldItem: JsonValue) => deepEqual(currentItem, oldItem));
        }
      } else {
        isDifferent = isPathDifferent(path, diffPaths);
      }
    } else {
      isDifferent = isPathDifferent(path, diffPaths);
    }
  } else {
    isDifferent = isPathDifferent(path, diffPaths);
  }

  const getLineClass = (different: boolean) => {
    if (!different) return "flex";
    return isOldVersion
      ? "flex bg-red-500/50 rounded-xs text-red-300"
      : "flex bg-green-500/50 rounded-xs text-green-300";
  };

  const prefix = isDifferent ? (isOldVersion ? " -" : " +") : " ";
  const keyDisplay = keyName ? `"${keyName}": ` : "";
  const comma = !isLastItem ? "," : "";

  const reactKey = `${path || "root"}-${keyName || "value"}-${indentLevel}-${typeof obj}`;

  if (
    obj === null ||
    typeof obj === "string" ||
    typeof obj === "number" ||
    typeof obj === "boolean"
  ) {
    let valueDisplay = "";
    if (obj === null) valueDisplay = "null";
    else if (typeof obj === "string") valueDisplay = `"${obj}"`;
    else valueDisplay = String(obj);

    return (
      <div key={reactKey} className={getLineClass(isDifferent)}>
        <div className="w-4 shrink-0">{prefix}</div>
        <div>
          {indent}
          {keyName && <span>{keyDisplay}</span>}
          <span>{valueDisplay}</span>
          {comma}
        </div>
      </div>
    );
  }

  if (isArray(obj) && obj.length === 0) {
    return (
      <div key={reactKey} className={getLineClass(isDifferent)}>
        <div className="w-4 shrink-0">{prefix}</div>
        <div>
          {indent}
          {keyName && <span>{keyDisplay}</span>}
          <span>[]</span>
          {comma}
        </div>
      </div>
    );
  }

  if (isObject(obj) && Object.keys(obj).length === 0) {
    return (
      <div key={reactKey} className={getLineClass(isDifferent)}>
        <div className="w-4 shrink-0">{prefix}</div>
        <div>
          {indent}
          {keyName && <span>{keyDisplay}</span>}
          <span>{"{}"}</span>
          {comma}
        </div>
      </div>
    );
  }

  let isContainerAddedOrRemoved = false;

  if (oldVersionObj && newVersionObj) {
    const oldValue = getNestedValue(oldVersionObj, path);
    const newValue = getNestedValue(newVersionObj, path);

    if (oldValue == null || newValue == null) {
      isContainerAddedOrRemoved = true;
    } else if (typeof oldValue !== typeof newValue) {
      isContainerAddedOrRemoved = true;
    } else if (isArray(oldValue) !== isArray(newValue)) {
      isContainerAddedOrRemoved = true;
    } else if (isObject(oldValue) !== isObject(newValue)) {
      isContainerAddedOrRemoved = true;
    }
  } else {
    isContainerAddedOrRemoved = isContainerActuallyChanged(
      path,
      diffPaths,
      isOldVersion ? obj : oldVersionObj || null,
      isOldVersion ? newVersionObj || null : obj
    );
  }

  if (isArray(obj)) {
    return (
      <div key={reactKey}>
        <div className={getLineClass(isContainerAddedOrRemoved)}>
          <div className="w-4 shrink-0">
            {isContainerAddedOrRemoved ? (isOldVersion ? " -" : " +") : " "}
          </div>
          <div>
            {indent}
            {keyName && <span>{keyDisplay}</span>}
            <span>[</span>
          </div>
        </div>

        {obj.map((item: JsonValue, index: number) => {
          const itemPath = path ? `${path}[${index}]` : `[${index}]`;
          const isLast = index === obj.length - 1;

          return (
            <div key={`${reactKey}-item-${index + 1}`}>
              {renderJsonWithDiffs(
                item,
                diffPaths,
                isOldVersion,
                itemPath,
                indentLevel + 1,
                undefined,
                isLast,
                excludedFieldsHighlight,
                oldVersionObj,
                newVersionObj
              )}
            </div>
          );
        })}

        <div className={getLineClass(isContainerAddedOrRemoved)}>
          <div className="w-4 shrink-0">
            {isContainerAddedOrRemoved ? (isOldVersion ? " -" : " +") : " "}
          </div>
          <div>
            {indent}
            <span>]</span>
            {comma}
          </div>
        </div>
      </div>
    );
  }

  if (isObject(obj)) {
    const keys = Object.keys(obj);

    return (
      <div key={reactKey}>
        <div className={getLineClass(isContainerAddedOrRemoved)}>
          <div className="w-4 shrink-0">
            {isContainerAddedOrRemoved ? (isOldVersion ? " -" : " +") : " "}
          </div>
          <div>
            {indent}
            {keyName && <span>{keyDisplay}</span>}
            <span>{"{"}</span>
          </div>
        </div>

        {keys.map((key, index) => {
          const keyPath = path ? `${path}.${key}` : key;
          const isLast = index === keys.length - 1;
          const propKey = `${reactKey}-prop-${key}`;

          return (
            <div key={propKey}>
              {renderJsonWithDiffs(
                obj[key],
                diffPaths,
                isOldVersion,
                keyPath,
                indentLevel + 1,
                key,
                isLast,
                excludedFieldsHighlight,
                oldVersionObj,
                newVersionObj
              )}
            </div>
          );
        })}

        <div className={getLineClass(isContainerAddedOrRemoved)}>
          <div className="w-4 shrink-0">
            {isContainerAddedOrRemoved ? (isOldVersion ? " -" : " +") : " "}
          </div>
          <div>
            {indent}
            <span>{"}"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div key={reactKey} className={getLineClass(isDifferent)}>
      <div className="w-4 shrink-0">{prefix}</div>
      <div>
        {indent}
        {keyDisplay}
        {String(obj)}
        {comma}
      </div>
    </div>
  );
};

const formatAddedJson = (json: JsonValue): JSX.Element => {
  const lines = JSON.stringify(json, null, 2).split("\n");
  return (
    <div className="font-mono text-sm text-green-300">
      {lines.map((line, lineIndex) => {
        const lineKey = `added-${line.slice(0, 30)}-${lineIndex}`;
        return (
          <div key={lineKey} className="flex">
            <div className="w-4 shrink-0">+</div>
            <div>{line}</div>
          </div>
        );
      })}
    </div>
  );
};

const formatDeletedJson = (json: JsonValue): JSX.Element => {
  const lines = JSON.stringify(json, null, 2).split("\n");
  return (
    <div className="font-mono text-sm text-red-300">
      {lines.map((line, lineIndex) => {
        const lineKey = `deleted-${line.slice(0, 30)}-${lineIndex}`;
        return (
          <div key={lineKey} className="flex">
            <div className="w-4 shrink-0">-</div>
            <div>{line}</div>
          </div>
        );
      })}
    </div>
  );
};

const cleanVersionForComparison = (version: Version): JsonValue => {
  const { id, version: versionNumber, ...cleanVersion } = version;
  return Object.fromEntries(
    Object.entries(cleanVersion).filter((entry) => typeof entry[1] !== "undefined")
  );
};

export const SecretVersionDiffView = ({
  item,
  isCollapsed = false,
  onToggleCollapse,
  showHeader = true,
  customHeader,
  excludedFieldsHighlight = ["metadata", "tags"],
  onDiscard
}: SecretVersionDiffViewProps) => {
  const oldContainerRef = useRef<HTMLDivElement>(null);
  const newContainerRef = useRef<HTMLDivElement>(null);
  const [internalCollapsed, setInternalCollapsed] = useState(isCollapsed);

  const handleToggle = useCallback(() => {
    if (onToggleCollapse && item.id) {
      onToggleCollapse(item.id);
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  }, [onToggleCollapse, item.id]);

  const collapsed = onToggleCollapse ? isCollapsed : internalCollapsed;

  if (!item.versions || item.versions.length === 0) {
    return <div className="px-6 py-3 text-gray-400">No details available</div>;
  }

  const sortedVersions = [...item.versions].sort((a, b) => b.version - a.version);
  let oldVersion = null;
  let newVersion = null;
  let oldVersionContent = null;
  let newVersionContent = null;
  let diffPaths = new Set<string>();

  if (item.isUpdated && sortedVersions.length >= 2) {
    if (item.isRollback) {
      [oldVersion, newVersion] = sortedVersions;
    } else {
      [newVersion, oldVersion] = sortedVersions;
    }

    const cleanOldVersion = cleanVersionForComparison(oldVersion);
    const cleanNewVersion = cleanVersionForComparison(newVersion);
    diffPaths = getDiffPaths(cleanOldVersion, cleanNewVersion);
    const hasNoChanges = diffPaths.size === 0;

    oldVersionContent = (
      <div className="w-fit min-w-full font-mono text-sm">
        {renderJsonWithDiffs(
          cleanOldVersion,
          diffPaths,
          true,
          "",
          0,
          undefined,
          false,
          excludedFieldsHighlight,
          cleanOldVersion,
          cleanNewVersion
        )}
      </div>
    );
    newVersionContent = (
      <div
        className={twMerge(
          "relative w-fit min-w-full font-mono text-sm",
          hasNoChanges && "[&>*+*]:opacity-0" // still want to render json to make container equivalent size to old version
        )}
      >
        {hasNoChanges && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-mineshaft-400">
            <span>No changes</span>
          </div>
        )}
        {renderJsonWithDiffs(
          cleanNewVersion,
          diffPaths,
          false,
          "",
          0,
          undefined,
          false,
          excludedFieldsHighlight,
          cleanOldVersion,
          cleanNewVersion
        )}
      </div>
    );
  } else if (item.isAdded) {
    [newVersion] = sortedVersions;
    const cleanNewVersion = cleanVersionForComparison(newVersion);
    newVersionContent = formatAddedJson(cleanNewVersion);
  } else if (item.isDeleted) {
    [oldVersion] = sortedVersions;
    const cleanOldVersion = cleanVersionForComparison(oldVersion);
    oldVersionContent = formatDeletedJson(cleanOldVersion);
  } else {
    return null;
  }

  const renderHeader = () => {
    if (customHeader) {
      return customHeader;
    }

    const isSecret = item.type === "secret";
    const key = isSecret ? item.secretKey || "Unnamed Secret" : item.folderName || "Unnamed Folder";
    let textStyle = "text-white";
    let changeBadge = null;

    if (item.isDeleted) {
      textStyle = "line-through text-red-300";
      changeBadge = (
        <span className="ml-2 rounded-md bg-mineshaft-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
          {isSecret ? "Secret" : "Folder"} Deleted
        </span>
      );
    } else if (item.isAdded) {
      changeBadge = (
        <span className="ml-2 rounded-md bg-mineshaft-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
          {isSecret ? "Secret" : "Folder"} Added
        </span>
      );
    } else if (item.isUpdated) {
      changeBadge = (
        <span className="ml-2 rounded-md bg-mineshaft-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
          {isSecret ? "Secret" : "Folder"} Updated
        </span>
      );
    }

    return (
      <div
        className="flex cursor-pointer items-center justify-between p-4 hover:bg-mineshaft-700"
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleToggle();
            e.preventDefault();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
      >
        <div className="flex min-w-0 flex-1 items-center">
          <p className={twMerge(textStyle, "truncate")}>{key}</p>
          {changeBadge}
        </div>
        {onDiscard && (
          <Tooltip side="left" content="Discard change">
            <IconButton
              ariaLabel="discard-change"
              variant="plain"
              colorSchema="danger"
              size="sm"
              className="ml-2"
              onClick={onDiscard}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </Tooltip>
        )}
        <FontAwesomeIcon
          icon={collapsed ? faChevronDown : faChevronUp}
          className="ml-2 text-gray-400"
        />
      </div>
    );
  };

  return (
    <div className="overflow-hidden border border-b-0 border-mineshaft-600 bg-mineshaft-800 first:rounded-t last:rounded-b last:border-b">
      {showHeader && renderHeader()}
      {!collapsed && (
        <div className="border-t border-mineshaft-700 bg-mineshaft-900 p-3 text-mineshaft-100">
          <div className="flex gap-3">
            <div
              ref={oldContainerRef}
              className="max-h-96 thin-scrollbar flex-1 overflow-auto whitespace-pre"
            >
              {oldVersionContent}
            </div>
            <div className="max-h-96 w-[0.05rem] self-stretch bg-mineshaft-600" />
            <div
              ref={newContainerRef}
              className="max-h-96 thin-scrollbar flex-1 overflow-auto whitespace-pre"
            >
              {newVersionContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
