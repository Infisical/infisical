/* eslint-disable no-nested-ternary */
import { useCallback, useContext, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { CircleHelpIcon, FolderIcon, KeyIcon, LayersIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";

import { SecretReferenceCloseContext } from "../SecretReferenceContext";
import { SecretNodeData } from "../utils/convertToFlowElements";

export const SecretNode = ({ data }: NodeProps & { data: SecretNodeData }) => {
  const {
    secretKey,
    environment,
    secretPath,
    projectId: crossProjectId,
    isRoot,
    isCircular
  } = data;

  const capitalizedEnv = environment.charAt(0).toUpperCase() + environment.slice(1);

  const pathTextRef = useRef<HTMLSpanElement>(null);
  const envTextRef = useRef<HTMLSpanElement>(null);
  const [isPathTruncated, setIsPathTruncated] = useState(false);
  const [isEnvTruncated, setIsEnvTruncated] = useState(false);

  const navigate = useNavigate();
  const routeParams = useParams({ strict: false });
  const { currentProject } = useProject();
  const onClose = useContext(SecretReferenceCloseContext);

  const checkPathTruncation = useCallback(() => {
    const el = pathTextRef.current;
    if (el) {
      setIsPathTruncated(el.scrollWidth > el.clientWidth);
    }
  }, []);

  const checkEnvTruncation = useCallback(() => {
    const el = envTextRef.current;
    if (el) {
      setIsEnvTruncated(el.scrollWidth > el.clientWidth);
    }
  }, []);

  const handleNavigate = useCallback(() => {
    if (isRoot) return;
    onClose?.();
    navigate({
      to: ROUTE_PATHS.SecretManager.OverviewPage.path,
      params: {
        orgId: routeParams.orgId as string,
        projectId: crossProjectId || currentProject?.id || ""
      },
      search: {
        secretPath,
        search: secretKey,
        environments: [environment]
      }
    });
  }, [
    navigate,
    routeParams.orgId,
    currentProject,
    crossProjectId,
    environment,
    secretPath,
    secretKey,
    isRoot,
    onClose
  ]);

  const envBadge = (
    <Badge
      variant="neutral"
      className="max-w-[50%] shrink-0"
      isTruncatable
      onMouseEnter={checkEnvTruncation}
    >
      <LayersIcon className="size-3" />
      <span ref={envTextRef}>{capitalizedEnv}</span>
    </Badge>
  );

  const pathBadge = (
    <Badge variant="neutral" className="min-w-0" isTruncatable onMouseEnter={checkPathTruncation}>
      <FolderIcon />
      <span ref={pathTextRef}>{secretPath}</span>
    </Badge>
  );

  return (
    <>
      <Handle
        type="target"
        className="pointer-events-none cursor-pointer! opacity-0"
        position={Position.Top}
      />
      <Tooltip open={isRoot ? undefined : false}>
        <TooltipTrigger asChild>
          <div className="relative">
            {isCircular && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="danger" className="absolute -top-6 right-0">
                    Circular
                    <CircleHelpIcon className="size-2" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  This secret contains circular references. Circular references are not expanded and
                  will lead to errors when you attempt to use them.
                </TooltipContent>
              </Tooltip>
            )}
            <div
              className={twMerge(
                "flex h-full w-full items-stretch gap-2.5 rounded-md border border-border bg-card p-2 shadow-lg",
                isCircular && "border-danger/40",
                isRoot && "border-project/40",
                !isRoot && "cursor-pointer transition-colors hover:border-foreground/20"
              )}
              onClick={!isRoot ? handleNavigate : undefined}
              role={!isRoot ? "button" : undefined}
              tabIndex={!isRoot ? 0 : undefined}
              onKeyDown={
                !isRoot
                  ? (e) => {
                      if (e.key === "Enter") handleNavigate();
                    }
                  : undefined
              }
            >
              <Badge
                variant={isCircular ? "danger" : isRoot ? "project" : "neutral"}
                className="!aspect-square h-auto !w-auto !min-w-0 shrink-0 self-stretch"
              >
                <KeyIcon className="size-4" />
              </Badge>
              <div className="flex w-full min-w-0 flex-col">
                <span
                  className={twMerge("truncate text-xs text-foreground", isRoot && "font-semibold")}
                >
                  {secretKey}
                </span>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {isEnvTruncated ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{envBadge}</TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs break-all">
                        {capitalizedEnv}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    envBadge
                  )}
                  {isPathTruncated ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{pathBadge}</TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs break-all">
                        {secretPath}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    pathBadge
                  )}
                </div>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          This is the secret whose dependencies are being viewed
        </TooltipContent>
      </Tooltip>
      <Handle
        type="source"
        className="pointer-events-none cursor-pointer! opacity-0"
        position={Position.Bottom}
      />
    </>
  );
};
