import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";

import { PageTitle } from "@app/components/PageTitle";

import { RootKeysSection } from "./RootKeysSection";
import { StrategyCard } from "./StrategyCard";

export const EncryptionPage = () => (
  <Stack gap={24}>
    <PageTitle title="Encryption" />
    <PageHeader title="Encryption" />
    <StrategyCard />
    <RootKeysSection />
  </Stack>
);
