import { useId } from "react";

import { Inline, Stack } from "@app/components/v4/ui/layout";
import { useServerConfig } from "@app/context";

import { AuthPage } from "../../../auth/components/AuthPage";
import { V4NotFoundPage } from "../../../V4NotFoundPage";
import { useShareSecretForm } from "../../share-secret-form";
import { usePublicSecretSharing } from "../PublicLayout";

export const ShareSecretPage = () => {
  const { config } = useServerConfig();
  const adapter = usePublicSecretSharing();
  const formId = useId();
  const create = adapter.useCreatePublicSharedSecret();
  const form = useShareSecretForm({ isPublic: true, create, formId });
  if (config.isPublicSecretSharingDisabled) return <V4NotFoundPage />;
  return (
    <AuthPage
      variant="focused"
      pageTitle="Securely Share Secrets"
      title="Share a secret"
      description="Create an encrypted link that expires on your terms."
    >
      <Stack gap={24}>
        {form.body}
        <Inline gap={8} justify="end">
          {form.submitButton}
        </Inline>
      </Stack>
    </AuthPage>
  );
};
