import { ChangeEvent, DragEvent, ReactNode, useState } from "react";
import { FileTextIcon, UploadIcon, XIcon } from "lucide-react";

import { cn } from "../../utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../Empty";
import { IconButton } from "../IconButton";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia } from "../Item";

// Split so the base name can truncate while the extension stays visible
const splitFileName = (fileName: string) => {
  const extIndex = fileName.lastIndexOf(".");
  if (extIndex <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, extIndex), ext: fileName.slice(extIndex) };
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type FileDropzoneProps = {
  // Files chosen in this interaction (click or drop). Receives an empty array
  // when a drop carries no real file (e.g. dragging out of VS Code), so
  // callers can surface their own error message for that case.
  onFilesSelect: (files: File[]) => void;
  // Selected files to display as rows under the dropzone. Omit to render the
  // surface alone (e.g. when selection immediately advances to another step).
  files?: File[];
  // Renders a remove action on each file row when provided
  onFileRemove?: (file: File, index: number) => void;
  multiple?: boolean;
  accept?: string;
  title?: ReactNode;
  dropTitle?: ReactNode;
  description?: ReactNode;
  isDisabled?: boolean;
  /** Layout/width on the outer dropzone wrapper */
  className?: string;
  /** Merged onto the inner `Empty` surface (background, padding, etc.) */
  emptyClassName?: string;
  /** SVG frame stroke at rest — forwarded to `Empty`'s `frameClassName` */
  frameClassName?: string;
  /** Frame stroke while dragging — defaults to `text-info` */
  activeFrameClassName?: string;
  /** Surface tint while dragging — defaults to `bg-info/10` */
  activeEmptyClassName?: string;
  /** Accent on the default "Choose file" label — defaults to `text-info` */
  accentClassName?: string;
};

function FileDropzone({
  onFilesSelect,
  files,
  onFileRemove,
  multiple = false,
  accept,
  title,
  dropTitle,
  description,
  isDisabled,
  className,
  emptyClassName,
  frameClassName,
  activeFrameClassName = "text-info",
  activeEmptyClassName = "bg-info/10",
  accentClassName = "text-info"
}: FileDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled || !e.dataTransfer) return;
    e.dataTransfer.dropEffect = "copy";
    setIsDragActive(false);
    const dropped = Array.from(e.dataTransfer.files);
    onFilesSelect(multiple ? dropped : dropped.slice(0, 1));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    onFilesSelect(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  return (
    <div data-slot="file-dropzone" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <Empty
        frame={isDragActive ? "solid" : "dashed"}
        frameClassName={cn(frameClassName, isDragActive && activeFrameClassName)}
        className={cn(
          "cursor-pointer bg-transparent",
          emptyClassName,
          isDragActive && activeEmptyClassName,
          isDisabled && "pointer-events-none opacity-50"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UploadIcon />
          </EmptyMedia>
          <EmptyTitle>
            {isDragActive
              ? (dropTitle ?? `Drop your file${multiple ? "s" : ""} here`)
              : (title ?? (
                  <>
                    Drag & drop or <span className={accentClassName}>Choose file</span> to upload
                  </>
                ))}
          </EmptyTitle>
          {description && <EmptyDescription>{description}</EmptyDescription>}
        </EmptyHeader>
        <input
          type="file"
          disabled={isDisabled}
          multiple={multiple}
          className="absolute top-0 left-0 h-full w-full cursor-pointer opacity-0"
          accept={accept}
          onChange={handleChange}
        />
      </Empty>
      {!!files?.length && (
        <ItemGroup>
          {files.map((file, index) => {
            const { base, ext } = splitFileName(file.name);
            return (
              // eslint-disable-next-line react/no-array-index-key
              <Item key={`${file.name}-${index}`} variant="outline" size="xs" role="listitem">
                <ItemMedia variant="icon">
                  <FileTextIcon />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <div className="flex max-w-full min-w-0 items-baseline text-sm text-foreground">
                    <span className="min-w-0 truncate">{base}</span>
                    <span className="shrink-0">{ext}</span>
                  </div>
                  <span className="text-xs text-muted">{formatFileSize(file.size)}</span>
                </ItemContent>
                {onFileRemove && (
                  <ItemActions>
                    <IconButton
                      variant="ghost"
                      size="xs"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => onFileRemove(file, index)}
                    >
                      <XIcon />
                    </IconButton>
                  </ItemActions>
                )}
              </Item>
            );
          })}
        </ItemGroup>
      )}
    </div>
  );
}

export { FileDropzone };
export type { FileDropzoneProps };
