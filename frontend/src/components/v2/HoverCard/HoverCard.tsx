import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as HoverCard from "@radix-ui/react-hover-card";

type Props = {
  text: string;
  icon: IconProp;
  color: string;
};

export type HoverCardProps = Props;

export const HoverObject = ({
    text,
    icon,
    color
  }: Props): JSX.Element => (
  <HoverCard.Root openDelay={50}>
    <HoverCard.Trigger asChild>
      <a
        className="ImageTrigger z-20"
      >
        <FontAwesomeIcon icon={icon} className={`text-${color}`} />
      </a>
    </HoverCard.Trigger>
    <HoverCard.Portal>
      <HoverCard.Content className="HoverCardContent z-[300]" sideOffset={5}>
        <div className='bg-bunker-700 border border-mineshaft-600 p-2 rounded-md drop-shadow-xl text-bunker-300'>
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div>
              <div className="Text bold">{text}</div>
            </div>
          </div>
        </div>

        <HoverCard.Arrow className="border-mineshaft-600" />
      </HoverCard.Content>
    </HoverCard.Portal>
  </HoverCard.Root>
);

HoverObject.displayName = "HoverCard";
