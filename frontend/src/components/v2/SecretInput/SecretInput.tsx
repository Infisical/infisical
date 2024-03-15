/* eslint-disable react/no-danger */
import React, { forwardRef, TextareaHTMLAttributes, useEffect, useRef, useState } from "react";
import { faChevronRight, faFolder, faKey, faRecycle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetUserWsKey } from "@app/hooks/api";
import { useGetFoldersByEnv } from "@app/hooks/api/secretFolders/queries";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";

const REGEX_REFERENCE = /(\${([^}]*)})/g;
const REGEX_REFERENCE_INVALID = /(?:\/|\\|\n|\.$|^\.)/g
const replaceContentWithDot = (str: string) => {
  let finalStr = "";
  for (let i = 0; i < str.length; i += 1) {
    const char = str.at(i);
    finalStr += char === "\n" ? "\n" : "*";
  }
  return finalStr;
};

const syntaxHighlight = (content?: string | null, isVisible?: boolean) => {
  if (content === "") return "EMPTY";
  if (!content) return "EMPTY";
  if (!isVisible) return replaceContentWithDot(content);

  let skipNext = false;
  const formattedContent = content.split(REGEX_REFERENCE).flatMap((el, i) => {
    const isInterpolationSyntax = el.startsWith("${") && el.endsWith("}");
    if (isInterpolationSyntax) {
      skipNext = true;
      return (
        <span className="ph-no-capture text-yellow" key={`secret-value-${i + 1}`}>
          &#36;&#123;<span
            className={twMerge(
              "ph-no-capture text-yellow-200/80",
              REGEX_REFERENCE_INVALID.test(el.slice(2, -1)) && "underline decoration-wavy decoration-red"
            )}
          >{el.slice(2, -1)}</span>
          &#125;
        </span>
      );
    }
    if (skipNext) {
      skipNext = false;
      return [];
    }
    return el;
  });

  // akhilmhdh: Dont remove this br. I am still clueless how this works but weirdly enough
  // when break is added a line break works properly
  return formattedContent.concat(<br />);
};

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value?: string | null;
  isVisible?: boolean;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  containerClassName?: string;
  environment?: string;
  secretPath?: string;
};

type ReferenceType = {
  name: string;
  type: "folder" | "secret";
  slug?: string;
};

const commonClassName = "font-mono text-sm caret-white border-none outline-none w-full break-all";

export const SecretInput = forwardRef<HTMLTextAreaElement, Props>(
  (
    {
      value: propValue,
      isVisible,
      containerClassName,
      onBlur,
      isDisabled,
      isReadOnly,
      onFocus,
      secretPath: propSecretPath,
      environment: propEnvironment,
      onChange,
      ...props
    },
    ref
  ) => {
    const childRef = useRef<HTMLTextAreaElement>(null);

    const [isSecretFocused, setIsSecretFocused] = useToggle();
    const [value, setValue] = useState<string>(propValue || "");
    const { currentWorkspace } = useWorkspace();
    const [listReference, setListReference] = useState<ReferenceType[]>([]);
    const [showReferencePopup, setShowReferencePopup] = useState<boolean>(false);
    const [referenceKey, setReferenceKey] = useState<string>();
    const [lastSelectionIndex, setLastSelectionIndex] = useState<number>(0);
    const [secretPath, setSecretPath] = useState<string>(
      propSecretPath || currentWorkspace?.environments?.[0].slug!
    );
    const [environment, setEnvironment] = useState<string>(
      propEnvironment || currentWorkspace?.environments?.[0].slug!
    );

    const workspaceId = currentWorkspace?.id || "";
    const { data: decryptFileKey } = useGetUserWsKey(workspaceId);
    const { data: secrets } = useGetProjectSecrets({
      decryptFileKey: decryptFileKey!,
      environment,
      secretPath,
      workspaceId
    });
    const { folderNames: folders } = useGetFoldersByEnv({
      path: secretPath,
      environments: [environment],
      projectId: workspaceId
    });

    useEffect(() => {
      let currentEnvironment = propEnvironment;
      let currentSecretPath = propSecretPath || "/";

      if (!referenceKey) {
        setSecretPath(currentSecretPath);
        setEnvironment(currentEnvironment!);
        return;
      }

      const isNested = referenceKey.includes(".");
      const currentListReference: ReferenceType[] = [];

      if (isNested) {
        const [envSlug, ...folderPaths] = referenceKey.split(".");
        currentEnvironment = envSlug;
        currentSecretPath = `/${folderPaths?.join("/")}` || "/";
      }

      if (
        !currentEnvironment ||
        !decryptFileKey ||
        !currentSecretPath ||
        !currentWorkspace ||
        !referenceKey
      ) {
        // this need to clean up?
        setListReference(currentListReference);
        return;
      }
      setSecretPath(currentSecretPath);
      setEnvironment(currentEnvironment);
      setShowReferencePopup(true);
    }, [referenceKey]);

    useEffect(() => {
      const currentListReference: ReferenceType[] = [];
      const isNested = referenceKey?.includes(".");

      if (isNested) {
        folders?.forEach((folder) => {
          currentListReference.unshift({ name: folder, type: "folder" });
        });
      }

      secrets?.forEach((secret) => {
        currentListReference.unshift({ name: secret.key, type: "secret" });
      });

      setListReference(currentListReference);
    }, [secrets, referenceKey]);

    function findMatch(str: string, start: number) {
      const matches = [...str.matchAll(REGEX_REFERENCE)];
      for (let i = 0; i < matches.length; i += 1) {
        const match = matches[i];
        if (
          match &&
          typeof match.index !== "undefined" &&
          match.index <= start &&
          start < match.index + match[0].length
        ) {
          return match;
        }
      }
      return null;
    }

    function setCaretPos(caretPos: number) {
      if (childRef?.current) {
        childRef.current.focus();
        setTimeout(() => {
          if (!childRef?.current) return;
          childRef.current.selectionStart = caretPos;
          childRef.current.selectionEnd = caretPos;
        }, 200);
      }
    }

    function referencePopup(text: string, pos: number) {
      const match = findMatch(text, pos);
      if (match && typeof match.index !== "undefined") {
        setLastSelectionIndex(pos);
        setReferenceKey(match?.[2]);
      }
      setShowReferencePopup(!!match);
    }

    function handleReferencePopup(element: HTMLTextAreaElement) {
      const { selectionStart, selectionEnd, value: text } = element;
      if (selectionStart !== selectionEnd || selectionStart === 0) {
        return;
      }
      referencePopup(text, selectionStart);
    }

    function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (event.key === "Escape") {
        setShowReferencePopup(false);
        return;
      }

      if (event.key === "{") {
        // auto close the bracket
        const currCaretPos = event.currentTarget.selectionEnd;
        const isPrevDollar = value[currCaretPos - 2] === "$";
        if (!isPrevDollar) return;

        const newValue = `${value.slice(0, currCaretPos)}}${value.slice(currCaretPos)}`;

        setValue(newValue);
        // TODO: there should be a better way to do
        onChange?.({ target: { value: newValue } } as any);
        setCaretPos(currCaretPos);

        if (event.currentTarget) {
          setTimeout(() => {
            referencePopup(newValue, currCaretPos);
          }, 200);

          return;
        }
      }
      // On Key up or down if the popup is open ignore it
      if ((showReferencePopup && event.key === "ArrowUp") || event.key === "ArrowDown") {
        event.preventDefault();
      }

      handleReferencePopup(event.currentTarget);
    }

    function handleMouseClick(event: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) {
      handleReferencePopup(event.currentTarget);
    }

    async function handleReferenceSelect({
      name,
      type,
      slug
    }: {
      name: string;
      type: "folder" | "secret" | "environment";
      slug?: string;
    }) {
      setShowReferencePopup(false);

      // forward ref for parent component
      if (typeof ref === "function") {
        ref(childRef.current);
      } else if (ref && "current" in ref) {
        const refCopy = ref;
        refCopy.current = childRef.current;
      }

      let newValue = value || "";
      const match = findMatch(newValue, lastSelectionIndex);
      const referenceStartIndex = match?.index || 0;
      const referenceEndIndex = referenceStartIndex + (match?.[0]?.length || 0);
      const [start, oldReference, end] = [
        value.slice(0, referenceStartIndex),
        value.slice(referenceStartIndex, referenceEndIndex),
        value.slice(referenceEndIndex)
      ];

      let oldReferenceStr = oldReference.slice(2, -1);
      let currentPath = type === "environment" ? slug! : name;
      currentPath = currentPath.replace(/\./g, "\\.");

      let replaceReference = "";
      let offset = 3;
      switch (type) {
        case "folder":
          replaceReference = `${oldReferenceStr}${currentPath}.`;
          offset -= 1;
          break;
        case "secret": {
          if (oldReferenceStr.indexOf(".") === -1) oldReferenceStr = "";
          replaceReference = `${oldReferenceStr}${currentPath}`;
          break;
        }
        case "environment":
          replaceReference = `${currentPath}.`;
          offset -= 1;
          break;
        default:
      }
      replaceReference = replaceReference.replace(/[//]/g, "");
      newValue = `${start}$\{${replaceReference}}${end}`;
      setValue(newValue);
      // TODO: there should be a better way to do
      onChange?.({ target: { value: newValue } } as any);
      setCaretPos(start.length + replaceReference.length + offset);
      if (type !== "secret") setReferenceKey(replaceReference);
    }

    function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
      setValue(event.target.value);
      if (typeof onChange === "function") onChange(event);
    }

    return (
      // TODO: hide popup if the focus within the child component left
      <div
        className={twMerge(
          "flex w-full flex-col gap-4 overflow-auto rounded-md no-scrollbar",
          containerClassName
        )}
        // style={{ maxHeight: `${21 * 7}px` }}
      >
        {/* TODO(radix): Move to radix select component and scroll element */}
        {showReferencePopup && isSecretFocused && (
          <div
            className={twMerge(
              "fixed z-[100] w-60 translate-y-2 rounded-md border border-mineshaft-600 bg-mineshaft-700 text-sm text-bunker-200"
            )}
            style={{
              marginTop: `${Math.min(childRef.current?.clientHeight || 21 * 7, 21 * 7)}px`
            }}
          >
            <div className="max-w-60 h-full w-full flex-col items-center justify-center rounded-md py-4 text-white">
              {listReference.map((e, i) => {
                return (
                  <button
                    className="flex items-center justify-between border-b border-mineshaft-600 px-2 py-1 text-left last:border-b-0"
                    key={`key-${i + 1}`}
                    onClick={() => handleReferenceSelect({ name: e.name, type: e.type })}
                    type="button"
                  >
                    {e.type === "folder" && (
                      <>
                        <div className="flex gap-2">
                          <div className="flex items-center text-yellow-700">
                            <FontAwesomeIcon icon={faFolder} />
                          </div>
                          <div className="w-48 truncate">{e.name}</div>
                        </div>
                        <div className="flex items-center text-bunker-200">
                          <FontAwesomeIcon icon={faChevronRight} />
                        </div>
                      </>
                    )}

                    {e.type === "secret" && (
                      <div className="flex gap-2">
                        <div className="flex items-center text-yellow-700">
                          <FontAwesomeIcon icon={faKey} />
                        </div>
                        <div className="w-48 truncate text-left">{e.name}</div>
                      </div>
                    )}
                  </button>
                );
              })}

              <div className="flex w-full justify-center gap-2 pt-1 text-xs text-bunker-300">
                All Secrets
              </div>

              {currentWorkspace?.environments.map((env, i) => (
                <button
                  className="flex items-center justify-between border-b border-mineshaft-600 px-2 py-1 last:border-b-0"
                  key={`key-${i + 1}`}
                  onClick={() =>
                    handleReferenceSelect({ name: env.name, type: "environment", slug: env.slug })
                  }
                  type="button"
                >
                  <div className="flex gap-2">
                    <div className="flex items-center text-yellow-700">
                      <FontAwesomeIcon icon={faRecycle} />
                    </div>
                    <div className="w-48 truncate text-left">{env.name}</div>
                  </div>
                  <div className="flex items-center text-bunker-200">
                    <FontAwesomeIcon icon={faChevronRight} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ maxHeight: `${21 * 7}px` }}>
          <div className="relative overflow-hidden">
            <pre aria-hidden className="m-0 ">
              <code className={`inline-block w-full  ${commonClassName}`}>
                <span style={{ whiteSpace: "break-spaces" }}>
                  {syntaxHighlight(value, isVisible || isSecretFocused)}
                </span>
              </code>
            </pre>

            <textarea
              style={{ whiteSpace: "break-spaces" }}
              aria-label="secret value"
              ref={childRef}
              className={twMerge(
                "absolute inset-0 block h-full resize-none overflow-hidden bg-transparent text-transparent no-scrollbar focus:border-0",
                commonClassName
              )}
              onFocus={() => setIsSecretFocused.on()}
              onKeyUp={handleKeyUp}
              onClick={handleMouseClick}
              onChange={handleChange}
              disabled={isDisabled}
              spellCheck={false}
              onBlur={(evt) => {
                onBlur?.(evt);
                if (!showReferencePopup) setIsSecretFocused.off();
              }}
              {...props}
              value={value}
              readOnly={isReadOnly}
            />
          </div>
        </div>
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
