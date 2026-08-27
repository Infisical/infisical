import { CSSProperties, DragEvent, useEffect, useRef, useState } from "react";
import { ClipboardPasteIcon, PlusIcon, UploadIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useToggle } from "@app/hooks";

type Props = {
  colSpan: number;
  onAddSecret: () => void;
  onImportFile: (file: File) => void;
  onImportSecrets: (step: "upload" | "paste") => void;
};

export const TableEmptyRow = ({ colSpan, onAddSecret, onImportFile, onImportSecrets }: Props) => {
  const [isDragActive, setIsDragActive] = useToggle();
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentStyle, setContentStyle] = useState<CSSProperties>();

  useEffect(() => {
    const content = contentRef.current;
    const tableContainer = content?.closest<HTMLElement>('[data-slot="table-container"]');
    if (!content || !tableContainer) return undefined;

    const updateContentWidth = () => {
      setContentStyle({ width: tableContainer.clientWidth });
    };

    updateContentWidth();

    const resizeObserver = new ResizeObserver(updateContentWidth);
    resizeObserver.observe(tableContainer);

    return () => resizeObserver.disconnect();
  }, []);

  const handleDrag = (event: DragEvent<HTMLTableCellElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === "dragenter" || event.type === "dragover") setIsDragActive.on();
    if (event.type === "dragleave") setIsDragActive.off();
  };

  const handleDrop = (event: DragEvent<HTMLTableCellElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive.off();

    const file = event.dataTransfer?.files[0];
    if (file) onImportFile(file);
  };

  return (
    <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Secrets}>
      {(isAllowed) => (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={colSpan}
            className="h-64 p-0 whitespace-normal"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={isAllowed ? handleDrop : undefined}
          >
            <div ref={contentRef} className="sticky left-0 h-full" style={contentStyle}>
              <Empty
                variant="unstyled"
                className={isAllowed && isDragActive ? "h-full bg-container-hover" : "h-full"}
              >
                <EmptyHeader>
                  <EmptyTitle>This table is empty.</EmptyTitle>
                  <EmptyDescription>Drag and drop your .env file here</EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="max-w-none flex-row flex-wrap justify-center gap-2">
                  <Tooltip open={!isAllowed ? undefined : false}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        isDisabled={!isAllowed}
                        onClick={() => onImportSecrets("upload")}
                      >
                        <UploadIcon />
                        Import .env
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Access Denied</TooltipContent>
                  </Tooltip>
                  <Tooltip open={!isAllowed ? undefined : false}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        isDisabled={!isAllowed}
                        onClick={() => onImportSecrets("paste")}
                      >
                        <ClipboardPasteIcon />
                        Paste Secrets
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Access Denied</TooltipContent>
                  </Tooltip>
                  <Tooltip open={!isAllowed ? undefined : false}>
                    <TooltipTrigger asChild>
                      <Button variant="project" isDisabled={!isAllowed} onClick={onAddSecret}>
                        <PlusIcon />
                        Add a New Secret
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Access Denied</TooltipContent>
                  </Tooltip>
                </EmptyContent>
              </Empty>
            </div>
          </TableCell>
        </TableRow>
      )}
    </ProjectPermissionCan>
  );
};
