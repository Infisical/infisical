import { ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { splitVariableReferences } from "@app/helpers/agentVaultVariables";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";

import { TServiceForm, UNCHANGED_SECRET } from "./serviceSchema";
import { useKnownVariableKeys, VariableChip } from "./VariableReferenceInput";

const MASK = "•".repeat(8);

// A reference holds no secret, so it is spelled out. Literal text is masked at a fixed length, which
// says nothing about the secret's own.
const PreviewValue = ({ value, placeholder }: { value?: string; placeholder: string }) => {
  const knownKeys = useKnownVariableKeys();

  if (!value) return <span className="text-muted">{placeholder}</span>;
  if (value === UNCHANGED_SECRET) return <span>{MASK}</span>;

  return (
    <>
      {splitVariableReferences(value).map((segment, index) =>
        segment.type === "text" ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={index}>{"•".repeat(4)}</span>
        ) : (
          <VariableChip
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            reference={segment.text}
            isKnown={segment.isValid && (!knownKeys || knownKeys.has(segment.key))}
          />
        )
      )}
    </>
  );
};

export const SendsPreview = () => {
  const { control } = useFormContext<TServiceForm>();
  const [credentialType, headerName, headerPrefix, username, secret, customHeaders] = useWatch({
    control,
    name: ["credentialType", "headerName", "headerPrefix", "username", "secret", "customHeaders"]
  });

  const lines: { id: string; content: ReactNode }[] = [];

  if (credentialType === AgentVaultCredentialType.Bearer) {
    lines.push({
      id: "credential",
      content: (
        <>
          {headerName || "Authorization"}: {headerPrefix ? `${headerPrefix} ` : ""}
          <PreviewValue value={secret} placeholder="<token>" />
        </>
      )
    });
  }

  if (credentialType === AgentVaultCredentialType.Basic) {
    lines.push({
      id: "credential",
      content: (
        <>
          Authorization: Basic base64(
          <PreviewValue value={username} placeholder="<username>" />:
          <PreviewValue value={secret} placeholder="<password>" />)
        </>
      )
    });
  }

  customHeaders
    .filter((header) => header.name)
    .forEach((header, index) => {
      lines.push({
        id: header.id ?? `new-${index}`,
        content: (
          <>
            {header.name}: {header.prefix ? `${header.prefix} ` : ""}
            <PreviewValue value={header.value} placeholder="<value>" />
          </>
        )
      });
    });

  if (!lines.length) return null;

  return (
    <div className="max-w-full min-w-0 overflow-hidden rounded-md border border-border bg-container">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-label">Sends</div>
      <pre className="block thin-scrollbar w-full max-w-full overflow-x-auto p-3 font-mono text-xs leading-relaxed whitespace-pre text-foreground">
        {lines.map((line) => (
          <div key={line.id}>{line.content}</div>
        ))}
      </pre>
    </div>
  );
};
