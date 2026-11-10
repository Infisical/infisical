import { PageTitle } from "@app/components/PageTitle";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";

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
