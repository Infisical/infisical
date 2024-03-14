/* eslint-disable react/no-danger */
import React, { forwardRef, TextareaHTMLAttributes, useRef, useState } from "react";
import { faChevronRight, faFolder, faKey, faRecycle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetUserWsKey } from "@app/hooks/api";
import { fetchProjectFolders } from "@app/hooks/api/secretFolders/queries";
import { decryptSecrets, fetchProjectEncryptedSecrets } from "@app/hooks/api/secrets/queries";

const REGEX_REFERENCE = /(\${([^}]*)})/g;
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
  const formatedContent = content.split(REGEX_REFERENCE).flatMap((el, i) => {
    const isInterpolationSyntax = el.startsWith("${") && el.endsWith("}");
    if (isInterpolationSyntax) {
      skipNext = true;
      return (
        <span className="ph-no-capture text-yellow" key={`secret-value-${i + 1}`}>
          &#36;&#123;<span className="ph-no-capture text-yellow-200/80">{el.slice(2, -1)}</span>
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
  return formatedContent.concat(<br />);
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

type VariableType = {
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
      secretPath,
      environment,
      onChange,
      ...props
    },
    ref
  ) => {
    const [isSecretFocused, setIsSecretFocused] = useToggle();
    const [showReferencePopup, setShowReferencePopup] = useState<boolean>(false);
    const [value, setValue] = useState<string>(propValue || "");
    const { currentWorkspace } = useWorkspace();
    const [listVariables, setListVariables] = useState<VariableType[]>([]);
    const [lastSelectionIndex, setLastSelectionIndex] = useState<number>(0);
    const childRef = useRef<HTMLTextAreaElement>(null);

    const workspaceId = currentWorkspace?.id || "";
    const { data: decryptFileKey } = useGetUserWsKey(workspaceId);

    async function extractReference(refValue: string) {
      const isNested = refValue.includes(".");
      const currentListVariable: VariableType[] = [];

      let currentEnvironment = environment;
      let currentSecretPath = secretPath || "/";

      if (isNested) {
        const [envSlug, ...folderPaths] = refValue.split(".");
        currentEnvironment = envSlug;
        currentSecretPath = `/${folderPaths?.join("/")}` || "/";
      }

      if (!currentEnvironment || !decryptFileKey || !currentSecretPath || !currentWorkspace) {
        setListVariables(currentListVariable);
        return;
      }

      // Move to react query
      const [encryptSecrets, folders] = await Promise.all([
        fetchProjectEncryptedSecrets({
          workspaceId,
          environment: currentEnvironment,
          secretPath: currentSecretPath
        }),
        // secret reference based on folder only support for nested reference that start with envs
        isNested ? fetchProjectFolders(workspaceId, currentEnvironment, currentSecretPath) : []
      ]);

      folders?.forEach((folder) => {
        currentListVariable.unshift({ name: folder.name, type: "folder" });
      });

      const secrets = decryptSecrets(encryptSecrets, decryptFileKey);

      secrets?.forEach((secret) => {
        currentListVariable.unshift({ name: secret.key, type: "secret" });
      });

      setListVariables(currentListVariable);
      setShowReferencePopup(true);
    }

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
        extractReference(match?.[2]);
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
        // auto close the tag
        const currCaretPos = event.currentTarget.selectionEnd;
        const isPrevDollar = value[currCaretPos - 2] === "$";
        if (!isPrevDollar) return;

        const newValue = `${value.slice(0, currCaretPos)}}${value.slice(currCaretPos)}`;

        setValue(newValue);
        if (event.currentTarget) {
          setCaretPos(currCaretPos);
          setTimeout(() => {
            // on next tick
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

      const oldReferenceStr = oldReference.slice(2, oldReference.length - 1); // remove template
      let replaceReference = "";
      let offset = 3;
      switch (type) {
        case "folder":
          replaceReference = `${oldReferenceStr}${name}.`;
          offset -= 1;
          break;
        case "secret":
          replaceReference = `${oldReferenceStr}${name}`;
          break;
        case "environment":
          replaceReference = `${slug}.`;
          offset -= 1;
          break;
        default:
      }
      newValue = `${start}$\{${replaceReference}}${end}`;
      setValue(newValue);
      setCaretPos(start.length + replaceReference.length + offset);
      if (type !== "secret") extractReference(replaceReference);
    }

    function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
      setValue(event.target.value);
      return onChange;
    }

    return (
      <div>
        <div
          className={twMerge("w-full overflow-auto rounded-md no-scrollbar", containerClassName)}
          style={{ maxHeight: `${21 * 7}px` }}
        >
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
        {/* TODO(radix): Move to radix select component and scroll element */}
        {showReferencePopup && isSecretFocused && (
          <div className="fixed z-[100] mt-2 w-60 rounded-md border border-mineshaft-600 bg-mineshaft-700 text-sm text-bunker-200">
            <div className="max-w-60 h-full w-full flex-col items-center justify-center rounded-md py-4 text-white">
              {listVariables.map((e, i) => {
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
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
