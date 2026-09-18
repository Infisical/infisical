import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as HoverCard from "@radix-ui/react-hover-card";

type Props = {
  text: string;
  icon: IconProp;
  color: string;
};

export type HoverCardProps = Props;

export const HoverObject = ({ text, icon, color }: Props): JSX.Element => (
  <HoverCard.Root openDelay={50}>
    <HoverCard.Trigger asChild>
      <a className="ImageTrigger z-20">
        <FontAwesomeIcon icon={icon} className={`text-${color}`} />
      </a>
    </HoverCard.Trigger>
    <HoverCard.Portal>
      <HoverCard.Content className="HoverCardContent z-300" sideOffset={5}>
        <div className="rounded-md border border-border-control bg-surface-sunken p-2 text-label-secondary drop-shadow-xl">
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div>
              <div className="Text bold">{text}</div>
            </div>
          </div>
        </div>

        <HoverCard.Arrow className="border-border-control" />
      </HoverCard.Content>
    </HoverCard.Portal>
  </HoverCard.Root>
);

HoverObject.displayName = "HoverCard";
