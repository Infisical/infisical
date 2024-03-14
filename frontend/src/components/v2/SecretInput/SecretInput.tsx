/* eslint-disable react/no-danger */
import React, { forwardRef, TextareaHTMLAttributes, useState } from "react";
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
          &#36;&#123;<span className="ph-no-capture text-yello-200/80">{el.slice(2, -1)}</span>
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
    { value, isVisible, containerClassName, onBlur, isDisabled, isReadOnly, onFocus, ...props },
    ref
  ) => {
    const [isSecretFocused, setIsSecretFocused] = useToggle();
    const [showReferencePopup, setShowReferencePopup] = useState<boolean>(false);
    const { currentWorkspace } = useWorkspace();
    const [listVariables, setListVariables] = useState<VariableType[]>([]);

    const workspaceId = currentWorkspace?.id || "";
    const { data: decryptFileKey } = useGetUserWsKey(workspaceId);

    const { environment, secretPath } = props;

    async function extractReference(refValue: string, refIndex: number) {
      console.log({ refIndex });
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

      console.log({ currentEnvironment, currentSecretPath });
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

      // get list of secrets, folder name and envs
      // On env select get list of secrets
      // on env select show list of secrets and folder
      // on env or folder select replace the text and update the caret?
      // fetch secrets based on current base environment and the path

      setListVariables(currentListVariable);
    }

    function handleVariablePopup(element: HTMLTextAreaElement) {
      const { selectionStart, selectionEnd, value: elValue } = element;
      if (selectionStart !== selectionEnd || selectionStart === 0) {
        setShowReferencePopup(false);
        return;
      }

      let match = null;
      for (
        let matches = REGEX_REFERENCE.exec(elValue);
        matches !== null;
        matches = REGEX_REFERENCE.exec(elValue)
      ) {
        if (matches.index <= selectionStart && REGEX_REFERENCE.lastIndex >= selectionStart) {
          match = matches?.[2];
          extractReference(match, matches.index);
        }
      }

      setShowReferencePopup(Boolean(match));
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
      // On Key up or down if the popup is open ignore it
      if ((showReferencePopup && event.key === "ArrowUp") || event.key === "ArrowDown") {
        event.preventDefault();
        // todo: point up or down in the variable popup
        // return;
      }
    }

    function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (event.key === "Escape") {
        setShowReferencePopup(false);
        return;
      }
      // On Key up or down if the popup is open ignore it
      if ((showReferencePopup && event.key === "ArrowUp") || event.key === "ArrowDown") {
        event.preventDefault();
        // todo: point up or down in the variable popup
        // return;
      }

      handleVariablePopup(event.currentTarget);
    }

    function handleMouseClick(event: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) {
      handleVariablePopup(event.currentTarget);
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
              ref={ref}
              className={`absolute inset-0 block h-full resize-none overflow-hidden bg-transparent text-transparent no-scrollbar focus:border-0 ${commonClassName}`}
              onFocus={() => setIsSecretFocused.on()}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              onClick={handleMouseClick}
              disabled={isDisabled}
              spellCheck={false}
              onBlur={(evt) => {
                onBlur?.(evt);
                if (!showReferencePopup) setIsSecretFocused.off();
              }}
              value={value || ""}
              {...props}
              readOnly={isReadOnly}
            />
          </div>
        </div>
        {showReferencePopup && isSecretFocused && (
          <div className="absolute z-10 mt-2 w-60 rounded-md border border-mineshaft-600 bg-mineshaft-700 text-sm text-bunker-200">
            <div className="max-w-60 h-full w-full flex-col items-center justify-center rounded-md py-4 text-white">
              {listVariables.map((e, i) => {
                return (
                  <div
                    className="flex items-center justify-between border-b border-mineshaft-600 px-2 py-1 last:border-b-0"
                    key={`key-${i + 1}`}
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
                        <div className="w-48 truncate">{e.name}</div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex w-full justify-center gap-2">All Secrets</div>

              {currentWorkspace?.environments.map((env, i) => (
                <div
                  className="flex items-center justify-between border-b border-mineshaft-600 px-2 py-1 last:border-b-0"
                  key={`key-${i + 1}`}
                >
                  <div className="flex gap-2">
                    <div className="flex items-center text-yellow-700">
                      <FontAwesomeIcon icon={faRecycle} />
                    </div>
                    <div className="w-48 truncate">{env.name}</div>
                  </div>
                  <div className="flex items-center text-bunker-200">
                    <FontAwesomeIcon icon={faChevronRight} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
