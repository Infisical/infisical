import { type LucideIcon } from "lucide-react";

type Props = {
  name: string;
  subtitle: string;
  image?: string;
  icon?: LucideIcon;
};

export const ExternalCaHeader = ({ name, subtitle, image, icon: Icon }: Props) => {
  return (
    <div className="flex w-full items-start gap-2">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-container">
        {image ? (
          <img
            alt={`${name} logo`}
            src={`/images/integrations/${image}`}
            className="h-7 w-7 object-contain"
          />
        ) : (
          Icon && <Icon className="h-5 w-5 text-foreground" />
        )}
      </div>
      <div>
        <div className="flex items-center gap-x-2 text-mineshaft-300">{name}</div>
        <p className="text-sm leading-4 font-normal text-mineshaft-400">{subtitle}</p>
      </div>
    </div>
  );
};
