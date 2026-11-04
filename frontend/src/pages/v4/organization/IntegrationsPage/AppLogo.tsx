import { Media } from "@app/components/v4/ui/item";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";

export const AppLogo = ({ app }: { app: AppConnection }) => {
  const { image, name } = APP_CONNECTION_MAP[app];
  return (
    <Media size="sm">
      <ProviderIcon icon={image} alt={`${name} logo`} size="md" />
    </Media>
  );
};
