/* eslint-disable react/prop-types */
import { useRef, useState } from "react";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export interface Version {
  id?: string;
  version: number;
  // Secret-specific fields
  secretKey?: string;
  secretValue?: string;
  secretComment?: string;
  skipMultilineEncoding?: boolean;
  // Folder-specific fields
  name?: string;
  // Allow other properties
  [key: string]: any;
}

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
}

const highlightChangedFields = (
  json: any,
  changedFields: Set<string>,
  isOldVersion: boolean
): JSX.Element => {
  const lines = JSON.stringify(json, null, 2).split("\n");
  return (
    <div className="font-mono text-sm">
      {lines.map((line, idx) => {
        const fieldMatch = line.match(/"([^"]+)":/);
        if (fieldMatch && changedFields.has(fieldMatch[1])) {
          // Check for different value types and highlight them

          // 1. String values: "field": "value"
          const stringMatch = line.match(/: "([^"]*)"(,?)$/);
          if (stringMatch) {
            const beforeValue = line.substring(0, line.indexOf(': "'));
            const value = `"${stringMatch[1]}"`;
            const afterValue = stringMatch[2] || "";

            return (
              <div
                key={`${idx + 1}`}
                className={
                  isOldVersion ? "flex bg-red-950 text-red-300" : "flex bg-green-950 text-green-300"
                }
              >
                <div className="w-4 flex-shrink-0">{isOldVersion ? "-" : "+"}</div>
                <div>
                  {beforeValue}:{" "}
                  <span
                    className={`rounded border border-none px-1 ${isOldVersion ? "bg-red-900" : "bg-green-900"}`}
                  >
                    {value}
                  </span>
                  {afterValue}
                </div>
              </div>
            );
          }

          // 2. Number values: "field": 123
          const numberMatch = line.match(/: (-?\d+(?:\.\d+)?)(,?)$/);
          if (numberMatch) {
            const beforeValue = line.substring(0, line.indexOf(": ") + 2);
            const value = numberMatch[1];
            const afterValue = numberMatch[2] || "";

            return (
              <div
                key={`${idx + 1}`}
                className={
                  isOldVersion ? "flex bg-red-950 text-red-300" : "flex bg-green-950 text-green-300"
                }
              >
                <div className="w-4 flex-shrink-0">{isOldVersion ? "-" : "+"}</div>
                <div>
                  {beforeValue.substring(0, beforeValue.length - 2)}:{" "}
                  <span
                    className={`rounded border border-none px-1 ${isOldVersion ? "bg-red-900" : "bg-green-900"}`}
                  >
                    {value}
                  </span>
                  {afterValue}
                </div>
              </div>
            );
          }

          // 3. Null values: "field": null
          const nullMatch = line.match(/: (null)(,?)$/);
          if (nullMatch) {
            const beforeValue = line.substring(0, line.indexOf(": ") + 2);
            const value = nullMatch[1];
            const afterValue = nullMatch[2] || "";

            return (
              <div
                key={`${idx + 1}`}
                className={
                  isOldVersion ? "flex bg-red-950 text-red-300" : "flex bg-green-950 text-green-300"
                }
              >
                <div className="w-4 flex-shrink-0">{isOldVersion ? "-" : "+"}</div>
                <div>
                  {beforeValue.substring(0, beforeValue.length - 2)}:{" "}
                  <span
                    className={`rounded border border-none px-1 ${isOldVersion ? "bg-red-900" : "bg-green-900"}`}
                  >
                    {value}
                  </span>
                  {afterValue}
                </div>
              </div>
            );
          }

          // 4. Boolean values: "field": true|false
          const booleanMatch = line.match(/: (true|false)(,?)$/);
          if (booleanMatch) {
            const beforeValue = line.substring(0, line.indexOf(": ") + 2);
            const value = booleanMatch[1];
            const afterValue = booleanMatch[2] || "";

            return (
              <div
                key={`${idx + 1}`}
                className={
                  isOldVersion ? "flex bg-red-950 text-red-300" : "flex bg-green-950 text-green-300"
                }
              >
                <div className="w-4 flex-shrink-0">{isOldVersion ? "-" : "+"}</div>
                <div>
                  {beforeValue.substring(0, beforeValue.length - 2)}:{" "}
                  <span
                    className={`rounded border border-none px-1 ${isOldVersion ? "bg-red-900" : "bg-green-900"}`}
                  >
                    {value}
                  </span>
                  {afterValue}
                </div>
              </div>
            );
          }

          // 5. Array values: Handle the first line of an array - "field": [
          const arrayStartMatch = line.match(/: \[(,?)$/);
          if (arrayStartMatch) {
            // This is the start of an array, highlight the whole line
            return (
              <div
                key={`${idx + 1}`}
                className={
                  isOldVersion ? "flex bg-red-950 text-red-300" : "flex bg-green-950 text-green-300"
                }
              >
                <div className="w-4 flex-shrink-0">{isOldVersion ? "-" : "+"}</div>
                <div>{line}</div>
              </div>
            );
          }

          // 6. Empty Array values: "field": []
          const emptyArrayMatch = line.match(/: \[\](,?)$/);
          if (emptyArrayMatch) {
            const beforeValue = line.substring(0, line.indexOf(": ") + 2);
            const value = "[]";
            const afterValue = emptyArrayMatch[1] || "";

            return (
              <div
                key={`${idx + 1}`}
                className={
                  isOldVersion ? "flex bg-red-950 text-red-300" : "flex bg-green-950 text-green-300"
                }
              >
                <div className="w-4 flex-shrink-0">{isOldVersion ? "-" : "+"}</div>
                <div>
                  {beforeValue.substring(0, beforeValue.length - 2)}:{" "}
                  <span
                    className={`rounded border border-none px-1 ${isOldVersion ? "bg-red-900" : "bg-green-900"}`}
                  >
                    {value}
                  </span>
                  {afterValue}
                </div>
              </div>
            );
          }

          // Check if this is part of an array or object that belongs to a changed field
          // This handles array items, closing brackets, and other complex structure contents
          const belongsToChangedField = () => {
            // If we're inside an array or object of a changed field, highlight it
            let openBrackets = 0;
            let openBraces = 0;
            let currentFieldName = null;

            for (let i = idx - 1; i >= 0; i -= 1) {
              const prevLine = lines[i];

              // Count brackets and braces to track nesting
              openBrackets += (prevLine.match(/\[/g) || []).length;
              openBrackets -= (prevLine.match(/\]/g) || []).length;
              openBraces += (prevLine.match(/{/g) || []).length;
              openBraces -= (prevLine.match(/}/g) || []).length;

              // If we find a field and we're still inside its value, check if it's a changed field
              const fieldNameMatch = prevLine.match(/"([^"]+)":/);
              if (fieldNameMatch && (openBrackets > 0 || openBraces > 0)) {
                [, currentFieldName] = fieldNameMatch;
                return changedFields.has(currentFieldName);
              }

              // If we've reached the root level, stop looking
              if (openBrackets <= 0 && openBraces <= 0) {
                return false;
              }
            }

            return false;
          };

          // Regular line with changed field or part of a changed complex structure
          if (belongsToChangedField()) {
            return (
              <div
                key={`${idx + 1}`}
                className={
                  isOldVersion ? "flex bg-red-950 text-red-300" : "flex bg-green-950 text-green-300"
                }
              >
                <div className="w-4 flex-shrink-0">{isOldVersion ? "-" : "+"}</div>
                <div>{line}</div>
              </div>
            );
          }

          // Simple fallback for any other cases of changed fields
          return (
            <div
              key={`${idx + 1}`}
              className={
                isOldVersion ? "flex bg-red-950 text-red-300" : "flex bg-green-950 text-green-300"
              }
            >
              <div className="w-4 flex-shrink-0">{isOldVersion ? "-" : "+"}</div>
              <div>{line}</div>
            </div>
          );
        }

        // Unchanged lines
        return (
          <div key={`${idx + 1}`} className="flex">
            <div className="w-4 flex-shrink-0" />
            <div>{line}</div>
          </div>
        );
      })}
    </div>
  );
};

// Helper: Format added JSON with + in a separate column
const formatAddedJson = (json: any): JSX.Element => {
  const lines = JSON.stringify(json, null, 2).split("\n");
  return (
    <div className="font-mono text-sm text-green-300">
      {lines.map((line, idx) => (
        <div key={`${idx + 1}`} className="flex">
          <div className="w-4 flex-shrink-0">+</div>
          <div>{line}</div>
        </div>
      ))}
    </div>
  );
};

// Helper: Format deleted JSON with - in a separate column
const formatDeletedJson = (json: any): JSX.Element => {
  const lines = JSON.stringify(json, null, 2).split("\n");
  return (
    <div className="font-mono text-sm text-red-300">
      {lines.map((line, idx) => (
        <div key={`${idx + 1}`} className="flex">
          <div className="w-4 flex-shrink-0">-</div>
          <div>{line}</div>
        </div>
      ))}
    </div>
  );
};

// Helper: Get differences between secret versions
export const getVersionDifferences = (versions: Version[]) => {
  if (!versions || versions.length === 0) return [];

  // Sort versions by version number (descending)
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);
  const newVersion = sortedVersions[0];

  // Fields to process
  const fieldsToProcess = [
    "secretKey",
    "secretValue",
    "secretComment",
    "skipMultilineEncoding",
    "secretReminderRepeatDays",
    "secretReminderNote",
    "metadata",
    "tags",
    "secretReminderRecipients",
    "name"
  ];

  // If only one version exists
  if (sortedVersions.length === 1) {
    return fieldsToProcess.reduce(
      (differences, field) => {
        if (newVersion[field] !== undefined && newVersion[field] !== null) {
          let newVal = newVersion[field];

          if (field === "tags" && Array.isArray(newVersion[field])) {
            if (newVersion[field].length > 0 && typeof newVersion[field][0] === "object") {
              newVal = newVersion[field].map((tag) => tag.name).join(", ");
            } else if (Array.isArray(newVersion[field])) {
              newVal = newVersion[field].join(", ");
            }
          }

          differences.push({
            field,
            oldValue: null,
            newValue: newVal
          });
        }
        return differences;
      },
      [] as { field: string; oldValue: any; newValue: any }[]
    );
  }

  // Otherwise, compare the two versions
  const oldVersion = sortedVersions[1];

  return fieldsToProcess.reduce(
    (differences, field) => {
      if (JSON.stringify(oldVersion[field]) !== JSON.stringify(newVersion[field])) {
        let oldVal = oldVersion[field];
        let newVal = newVersion[field];

        if (field === "tags" && Array.isArray(oldVersion[field])) {
          if (oldVersion[field].length > 0 && typeof oldVersion[field][0] === "object") {
            oldVal = oldVersion[field].map((tag) => tag.name).join(", ");
          } else if (Array.isArray(oldVersion[field])) {
            oldVal = oldVersion[field].join(", ");
          }
        }

        if (field === "tags" && Array.isArray(newVersion[field])) {
          if (newVersion[field].length > 0 && typeof newVersion[field][0] === "object") {
            newVal = newVersion[field].map((tag) => tag.name).join(", ");
          } else if (Array.isArray(newVersion[field])) {
            newVal = newVersion[field].join(", ");
          }
        }

        differences.push({
          field,
          oldValue: oldVal,
          newValue: newVal
        });
      }
      return differences;
    },
    [] as { field: string; oldValue: any; newValue: any }[]
  );
};

// Helper: Get differences between folder versions
export const getFolderDifferences = (versions: Version[]) => {
  if (!versions || versions.length === 0) return [];

  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);
  const newVersion = sortedVersions[0];

  if (sortedVersions.length === 1) {
    return [
      {
        field: "folderName",
        oldValue: null,
        newValue: newVersion.name
      }
    ];
  }

  const oldVersion = sortedVersions[1];
  return [
    {
      field: "folderName",
      oldValue: oldVersion.name,
      newValue: newVersion.name
    }
  ];
};

export const SecretVersionDiffView: React.FC<SecretVersionDiffViewProps> = ({
  item,
  isCollapsed = false,
  onToggleCollapse,
  showHeader = true,
  customHeader
}) => {
  const oldContainerRef = useRef<HTMLDivElement>(null);
  const newContainerRef = useRef<HTMLDivElement>(null);
  const [isScrollingSynced, setIsScrollingSynced] = useState(false);
  const [internalCollapsed, setInternalCollapsed] = useState(isCollapsed);

  const collapsed = onToggleCollapse ? isCollapsed : internalCollapsed;

  const handleToggle = () => {
    if (onToggleCollapse && item.id) {
      onToggleCollapse(item.id);
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  };

  if (!item.versions) {
    return <div className="px-6 py-3 text-gray-400">No details available</div>;
  }

  const differences = getVersionDifferences(item.versions);

  if (differences.length === 0) {
    return <div className="px-6 py-3 text-gray-400">No details available</div>;
  }

  const changedFields = new Set<string>();
  differences.forEach((diff) => {
    if (JSON.stringify(diff.oldValue) !== JSON.stringify(diff.newValue)) {
      changedFields.add(diff.field);
    }
  });

  const handleScroll = (container: "old" | "new") => {
    if (isScrollingSynced) return;
    setIsScrollingSynced(true);

    if (container === "old" && oldContainerRef.current && newContainerRef.current) {
      newContainerRef.current.scrollTop = oldContainerRef.current.scrollTop;
    } else if (container === "new" && oldContainerRef.current && newContainerRef.current) {
      oldContainerRef.current.scrollTop = newContainerRef.current.scrollTop;
    }

    setTimeout(() => setIsScrollingSynced(false), 50);
  };

  const sortedVersions = [...item.versions].sort((a, b) => b.version - a.version);

  let oldVersion = null;
  let newVersion = null;
  let oldVersionContent = null;
  let newVersionContent = null;

  if (item.isUpdated) {
    if (item.isRollback) {
      [oldVersion, newVersion] = sortedVersions;
    } else {
      [newVersion, oldVersion] = sortedVersions;
    }
    oldVersionContent = highlightChangedFields(oldVersion, changedFields, true);
    newVersionContent = highlightChangedFields(newVersion, changedFields, false);
  } else if (item.isAdded) {
    [newVersion] = sortedVersions;
    oldVersionContent = <div className="italic text-gray-400" />;
    newVersionContent = formatAddedJson(newVersion);
  } else if (item.isDeleted) {
    [oldVersion] = sortedVersions;
    oldVersionContent = formatDeletedJson(oldVersion);
    newVersionContent = <div className="italic text-gray-400" />;
  }

  const renderHeader = () => {
    if (customHeader) {
      return customHeader;
    }

    const isSecret = item.type === "secret";
    const key = isSecret ? item.secretKey || "" : item.folderName || "";
    let textStyle = "text-white";
    let changeBadge = null;

    if (item.isDeleted) {
      textStyle = "line-through text-red-300";
      changeBadge = (
        <span className="ml-2 rounded-md bg-mineshaft-600 px-2 py-0.5 text-xs font-medium">
          {isSecret ? "Secret" : "Folder"} Deleted
        </span>
      );
    } else if (item.isAdded) {
      changeBadge = (
        <span className="ml-2 rounded-md bg-mineshaft-600 px-2 py-0.5 text-xs font-medium">
          {isSecret ? "Secret" : "Folder"} Added
        </span>
      );
    } else if (item.isUpdated) {
      changeBadge = (
        <span className="ml-2 rounded-md bg-mineshaft-600 px-2 py-0.5 text-xs font-medium">
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
        <div className="flex items-center">
          <span className={textStyle}>{key}</span>
          {changeBadge}
        </div>
        <FontAwesomeIcon icon={collapsed ? faChevronDown : faChevronUp} className="text-gray-400" />
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-mineshaft-600 bg-mineshaft-800">
      {showHeader && renderHeader()}

      {!collapsed && (
        <div className="border-t border-mineshaft-700 bg-mineshaft-900 px-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div
              ref={oldContainerRef}
              className="thin-scrollbar max-h-96 overflow-auto whitespace-pre rounded border border-mineshaft-600 bg-mineshaft-900 p-4"
              onScroll={() => handleScroll("old")}
            >
              {oldVersionContent}
            </div>

            <div
              ref={newContainerRef}
              className="thin-scrollbar max-h-96 overflow-auto whitespace-pre rounded border border-mineshaft-600 bg-mineshaft-900 p-4"
              onScroll={() => handleScroll("new")}
            >
              {newVersionContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
