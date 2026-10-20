import { FolderIcon, KeyIcon } from "lucide-react";

import { TVaultImportPreview } from "./VaultImportPreview.utils";

type Props = {
  preview: TVaultImportPreview;
};

const ROW_INDENT_PX = 18;

export const VaultImportPreview = ({ preview }: Props) => (
  <div className="flex flex-col gap-2" aria-hidden="true">
    <span className="text-[10px] font-medium tracking-wider text-muted uppercase">Preview</span>
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3.5 py-2.5 text-xs text-label">
        {preview.headline}
      </div>
      <div className="max-h-64 overflow-y-auto px-3.5 py-2.5">
        {preview.rows.map((row) => (
          <div
            key={row.key}
            className="flex h-7 items-center gap-2"
            style={{ paddingLeft: row.depth * ROW_INDENT_PX }}
          >
            {row.kind === "folder" ? (
              <FolderIcon className="size-3.5 shrink-0 text-folder" />
            ) : (
              <KeyIcon className="size-3.5 shrink-0 text-secret" />
            )}
            <span
              title={row.title ?? row.name}
              className={`truncate font-mono text-[12.5px] ${
                row.kind === "folder" ? "text-foreground" : "text-label"
              }`}
            >
              {row.name}
            </span>
            {row.source && (
              <span
                title={row.source}
                className="ml-auto truncate pl-2 font-mono text-[11px] text-muted"
              >
                {row.source}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
    <p className="text-[11px] text-muted">Secrets displayed on the preview are placeholders.</p>
  </div>
);
