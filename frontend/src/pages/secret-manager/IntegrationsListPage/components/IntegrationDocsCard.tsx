import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type Props = {
  name: string;
  category: string;
  description: string;
  href: string;
  image?: string;
  icon?: IconDefinition;
};

export const IntegrationDocsCard = ({ name, category, description, href, image, icon }: Props) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-mineshaft-500 hover:bg-mineshaft-700/50"
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-mineshaft-700">
        {image ? (
          <img
            src={`/images/integrations/${image}.png`}
            alt={`${name} logo`}
            className="h-6 w-6 object-contain"
          />
        ) : (
          icon && <FontAwesomeIcon icon={icon} className="text-base text-foreground" />
        )}
      </div>
      <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
        {category}
      </span>
    </div>
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-foreground">{name}</p>
      <p className="text-xs leading-relaxed text-muted">{description}</p>
    </div>
  </a>
);
