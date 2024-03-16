import React, { useEffect, useState } from "react";
import {
  faCaretDown,
  faCaretUp,
  faChevronRight,
  faFolder,
  faKey,
  faRecycle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as SelectPrimitive from "@radix-ui/react-select";
import { twMerge } from "tailwind-merge";

import { useWorkspace } from "@app/context";
import { useGetUserWsKey } from "@app/hooks/api";
import { useGetFoldersByEnv } from "@app/hooks/api/secretFolders/queries";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";

type ReferenceType = "environment" | "folder" | "secret";

type Props = {
  open: boolean;
  reference?: string;
  secretPath?: string;
  environment?: string;
  handleOpenChange: (params: boolean) => void;
  onEscapeKeyDown: () => void;
  onSelect: (params: { type: ReferenceType; name: string; slug?: string }) => void;
};

type ReferenceItem = {
  name: string;
  type: "folder" | "secret";
  slug?: string;
};

export default function SecretReferenceSelect({
  open,
  secretPath: propSecretPath,
  environment: propEnvironment,
  handleOpenChange,
  reference,
  onSelect,
  onEscapeKeyDown
}: Props) {
  const { currentWorkspace } = useWorkspace();
  const [listReference, setListReference] = useState<ReferenceItem[]>([]);
  const [secretPath, setSecretPath] = useState<string>(propSecretPath || "/");
  const [environment, setEnvironment] = useState<string | undefined>(propEnvironment);
  const workspaceId = currentWorkspace?.id || "";
  const { data: decryptFileKey } = useGetUserWsKey(workspaceId);
  const { data: secrets } = useGetProjectSecrets({
    decryptFileKey: decryptFileKey!,
    environment: environment || currentWorkspace?.environments?.[0].slug!,
    secretPath,
    workspaceId
  });
  const { folderNames: folders } = useGetFoldersByEnv({
    path: secretPath,
    environments: [environment || currentWorkspace?.environments?.[0].slug!],
    projectId: workspaceId
  });

  useEffect(() => {
    let currentEnvironment = propEnvironment;
    let currentSecretPath = propSecretPath || "/";

    if (!reference) {
      setSecretPath(currentSecretPath);
      setEnvironment(currentEnvironment!);
      return;
    }

    const isNested = reference.includes(".");

    if (isNested) {
      const [envSlug, ...folderPaths] = reference.split(".");
      const isValidEnvSlug = currentWorkspace?.environments.find((e) => e.slug === envSlug);
      currentEnvironment = isValidEnvSlug ? envSlug : undefined;
      currentSecretPath = `/${folderPaths?.join("/")}` || "/";
    }

    setSecretPath(currentSecretPath);
    setEnvironment(currentEnvironment);
  }, [reference]);

  useEffect(() => {
    const currentListReference: ReferenceItem[] = [];
    const isNested = reference?.includes(".");

    if (!environment) {
      setListReference(currentListReference);
      return;
    }

    if (isNested) {
      folders?.forEach((folder) => {
        currentListReference.unshift({ name: folder, type: "folder" });
      });
    }

    secrets?.forEach((secret) => {
      currentListReference.unshift({ name: secret.key, type: "secret" });
    });

    setListReference(currentListReference);
  }, [secrets, environment, reference]);

  return (
    <SelectPrimitive.Root
      open={open}
      onOpenChange={handleOpenChange}
      onValueChange={(str) => onSelect(JSON.parse(str))}
    >
      <SelectPrimitive.Trigger>
        <SelectPrimitive.Value>
          <div />
        </SelectPrimitive.Value>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={twMerge(
            "relative top-3 z-[100] ml-4 overflow-hidden rounded-md border border-mineshaft-600 bg-mineshaft-900 font-inter text-bunker-100 shadow-md"
          )}
          position="popper"
          side="left"
          onEscapeKeyDown={onEscapeKeyDown}
          style={{
            width: "300px",
            maxHeight: "var(--radix-select-content-available-height)"
          }}
        >
          <SelectPrimitive.ScrollUpButton>
            <div className="flex items-center justify-center">
              <FontAwesomeIcon icon={faCaretUp} size="sm" />
            </div>
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="max-w-60 h-full w-full flex-col items-center justify-center rounded-md p-1 py-4 text-white">
            <SelectPrimitive.Group>
              {listReference.map((e, i) => {
                return (
                  <SelectPrimitive.Item
                    className="flex items-center justify-between border-b border-mineshaft-600 px-2  text-left last:border-b-0"
                    key={`secret-reference-secret-${i + 1}`}
                    value={JSON.stringify(e)}
                    asChild
                  >
                    <SelectPrimitive.ItemText asChild>
                      <div className="text-md relative mb-0.5 flex w-full cursor-pointer select-none items-center justify-between rounded-md px-2 outline-none transition-all hover:bg-mineshaft-500 data-[highlighted]:bg-mineshaft-500">
                        <div className="flex gap-2">
                          <div className="flex items-center text-yellow-700">
                            <FontAwesomeIcon icon={e.type === "secret" ? faKey : faFolder} />
                          </div>
                          <div className="text-md w-48 truncate text-left">{e.name}</div>
                        </div>
                        {e.type === "folder" && (
                          <div className="flex items-center text-bunker-200">
                            <FontAwesomeIcon icon={faChevronRight} />
                          </div>
                        )}
                      </div>
                    </SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                );
              })}

              {listReference.length !== 0 && (
                <SelectPrimitive.Separator className="m-1 h-[1px] mb-2 bg-mineshaft-400" />
              )}
            </SelectPrimitive.Group>

            <SelectPrimitive.Group>
              <SelectPrimitive.Label className="flex w-full justify-center gap-2 pt-1 text-sm text-bunker-300">
                All Secrets
              </SelectPrimitive.Label>

              {currentWorkspace?.environments.map((env, i) => (
                <SelectPrimitive.Item
                  className="flex items-center justify-between border-b border-mineshaft-600 px-2  text-left last:border-b-0"
                  key={`secret-reference-env-${i + 1}`}
                  value={JSON.stringify({ ...env, type: "environment" })}
                  asChild
                >
                  <SelectPrimitive.ItemText asChild>
                    <div className="text-md relative mb-0.5 flex w-full cursor-pointer select-none items-center justify-between rounded-md px-2 outline-none transition-all hover:bg-mineshaft-500 data-[highlighted]:bg-mineshaft-500">
                      <div className="flex gap-2">
                        <div className="flex items-center text-yellow-700">
                          <FontAwesomeIcon icon={faRecycle} />
                        </div>
                        <div className="text-md w-48 truncate text-left">{env.name}</div>
                      </div>
                      <div className="flex items-center text-bunker-200">
                        <FontAwesomeIcon icon={faChevronRight} />
                      </div>
                    </div>
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Group>
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton>
            <div className="flex items-center justify-center">
              <FontAwesomeIcon icon={faCaretDown} size="sm" />
            </div>
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
