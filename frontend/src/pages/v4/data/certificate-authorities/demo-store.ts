import type { TUnifiedCertificateAuthority } from "@app/hooks/api/ca/types";

import { createFixtureStore } from "../fixture-store";

export const demoCreatedCas = createFixtureStore<TUnifiedCertificateAuthority[]>([]);
