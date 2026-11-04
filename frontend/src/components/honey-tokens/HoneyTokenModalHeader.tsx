import { DocumentationLinkBadge, SheetDescription, SheetTitle } from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

type Props = {
  type: HoneyTokenType;
  isEdit?: boolean;
};

export const HoneyTokenModalHeader = ({ type, isEdit }: Props) => {
  const details = HONEY_TOKEN_MAP[type];

  return (
    <div className="flex w-full items-center gap-3">
      <ProviderIcon alt={`${details.name} logo`} icon={details.image} className="h-10 w-10" />
      <div className="flex flex-col gap-1">
        <SheetTitle className="flex items-center gap-x-2">
          {isEdit ? "Edit" : ""} {details.name} Honey Token
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/honey-tokens/overview" />
        </SheetTitle>
        <SheetDescription className="leading-4 text-muted">
          Plant a decoy credential that alerts on access
        </SheetDescription>
      </div>
    </div>
  );
};
