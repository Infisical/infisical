import { type DragEvent, type ReactNode, useState } from "react";

import styles from "./import-secrets.module.css";

export function SecretDropzone({
  disabledReason,
  onFile,
  children
}: {
  disabledReason?: string;
  onFile: (file: File) => void;
  children: ReactNode;
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const handleDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") setIsDragActive(true);
    if (event.type === "dragleave") setIsDragActive(false);
  };
  return (
    <div
      className={styles.dropTarget}
      data-dragging={(!disabledReason && isDragActive) || undefined}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragActive(false);
        const file = event.dataTransfer?.files[0];
        if (file && !disabledReason) onFile(file);
      }}
    >
      {children}
    </div>
  );
}
