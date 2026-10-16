import { ArrowDownIcon } from "lucide-react";

const PLACEHOLDER = "__API_TOKEN__";
const REAL_VALUE = "sk_live_••••4f2a";

const Token = ({ children, isResolved }: { children: string; isResolved?: boolean }) => (
  <span
    className={`rounded-xs px-1 ${
      isResolved ? "bg-success/10 text-success" : "bg-foreground/10 text-foreground"
    }`}
  >
    {children}
  </span>
);

const Wire = ({
  title,
  isResolved,
  token
}: {
  title: string;
  isResolved?: boolean;
  token: string;
}) => (
  <div className="overflow-hidden rounded-md border border-border">
    <div className="flex items-center gap-1.5 border-b border-border bg-container px-2.5 py-1.5 font-mono text-[10px] text-muted">
      {title}
    </div>
    <div className="flex flex-col gap-1 px-2.5 py-2 font-mono text-[11px] break-all text-foreground">
      <p>
        GET /v1/keys/
        <Token isResolved={isResolved}>{token}</Token>
      </p>
      <p>
        Authorization: Bearer <Token isResolved={isResolved}>{token}</Token>
      </p>
    </div>
  </div>
);

export const SubstitutionExample = () => (
  <div className="flex flex-col gap-2">
    <p className="text-xs text-foreground">
      Where should the placeholder be swapped for the real value?
    </p>
    <Wire title="Agent sends" token={PLACEHOLDER} />
    <p className="flex items-center gap-1.5 text-[11px] text-muted">
      <ArrowDownIcon className="size-3 shrink-0" />
      Infisical substitutes in the parts you select
    </p>
    <Wire title="Service receives" token={REAL_VALUE} isResolved />
    <p className="text-[11px] text-muted">
      This example needs <span className="text-foreground">URL Path</span> and{" "}
      <span className="text-foreground">Headers</span>.
    </p>
  </div>
);
