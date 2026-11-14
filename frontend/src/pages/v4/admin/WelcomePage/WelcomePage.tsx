import { Media, Tile } from "@infisical/cipher/ui/item";
import { Stack } from "@infisical/cipher/ui/layout";
import { useRouteContext } from "@tanstack/react-router";

import { AuthPage } from "../../auth/components/AuthPage";
import { orgHref, useGo, v4Path } from "../../links";

export const WelcomePage = () => {
  const { organizationId } = useRouteContext({ from: "/v4/admin" });
  const go = useGo();
  return (
    <AuthPage
      variant="focused"
      pageTitle="Instance Ready"
      title="Your instance is ready"
      footer="You can open the Server console later from the app navigation header."
    >
      <Stack gap={8}>
        <Tile
          media={<Media icon="building" />}
          title="Go to dashboard"
          description="Create projects, manage secrets, and invite your team."
          onClick={() => go(orgHref(organizationId, "/projects"))}
        />
        <Tile
          media={<Media icon="settings" />}
          title="Open the Server console"
          description="Make fine-grained adjustments to the instance configuration."
          onClick={() => go(v4Path("/admin"))}
        />
      </Stack>
    </AuthPage>
  );
};
