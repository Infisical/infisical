import { type LucideIcon } from "lucide-react";

import { ProviderIcon, SheetDescription, SheetTitle } from "@app/components/v3";

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
          <ProviderIcon alt={`${name} logo`} icon={image} className="h-7 w-7 object-contain" />
        ) : (
          Icon && <Icon className="h-5 w-5 text-foreground" />
        )}
      </div>
      <div>
        <SheetTitle>{name}</SheetTitle>
        <SheetDescription>{subtitle}</SheetDescription>
      </div>
    </div>
  );
};
