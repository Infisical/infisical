import { useEffect, useState } from "react";

import { CopyButton } from "@app/components/v4/ui/sensitive-editor";

import { type AgentDocument, loadAgentDocument } from "./agent-source";
import { PageHeading } from "./doc-parts";
import { documentationPages } from "./navigation";

export const AgentPage = ({ page }: { page: string }) => {
  const [document, setDocument] = useState<
    { kind: "loading" } | { kind: "ready"; value: AgentDocument } | { kind: "error" }
  >({ kind: "loading" });
  useEffect(() => {
    let active = true;
    loadAgentDocument(page).then(
      (value) => {
        if (active) setDocument({ kind: "ready", value });
      },
      () => {
        if (active) setDocument({ kind: "error" });
      }
    );
    return () => {
      active = false;
    };
  }, [page]);
  const title = documentationPages.find((entry) => entry.id === page)?.title ?? page;
  return (
    <div data-document-view="agent">
      <PageHeading title={title} />
      {document.kind === "loading" && <p role="status">Loading agent document</p>}
      {document.kind === "error" && (
        <p role="alert">The agent document could not load. Reload this page to try again.</p>
      )}
      {document.kind === "ready" && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <code className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
              {document.value.source}
            </code>
            <CopyButton value={document.value.markdown} label="Copy Markdown" iconOnly />
          </div>
          <pre
            data-agent-markdown
            className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm leading-6 [overflow-wrap:anywhere] whitespace-pre-wrap sm:p-6"
          >
            <code>{document.value.markdown}</code>
          </pre>
        </>
      )}
    </div>
  );
};
