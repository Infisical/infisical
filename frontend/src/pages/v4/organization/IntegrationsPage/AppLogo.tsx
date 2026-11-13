import { Media } from "@infisical/cipher/ui/item";

import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

export const AppLogo = ({ app }: { app: AppConnection }) => {
  const { image, name } = APP_CONNECTION_MAP[app];
  return (
    <Media size="sm">
      <ProviderIcon icon={image} alt={`${name} logo`} size="md" />
    </Media>
  );
};
