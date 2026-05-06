import { Item, ItemContent, ItemMedia, ItemTitle } from "@app/components/v3";
import { HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

type Props = {
  onSelect: (type: HoneyTokenType) => void;
};

const HONEY_TOKEN_OPTIONS = Object.values(HoneyTokenType);

export const HoneyTokenSelect = ({ onSelect }: Props) => {
  return (
    <div className="max-h-[60vh] overflow-y-auto">
      <div className="grid grid-cols-3 gap-2">
        {HONEY_TOKEN_OPTIONS.map((type) => {
          const { image, name, size } = HONEY_TOKEN_MAP[type];

          return (
            <Item
              key={type}
              variant="outline"
              className="cursor-pointer flex-col items-center justify-center py-4 hover:bg-foreground/5"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(type)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(type);
                }
              }}
            >
              <ItemMedia variant="image" className="size-12">
                <img src={`/images/integrations/${image}`} width={size} alt={`${name} logo`} />
              </ItemMedia>
              <ItemContent className="items-center">
                <ItemTitle>{name}</ItemTitle>
              </ItemContent>
            </Item>
          );
        })}
      </div>
    </div>
  );
};
