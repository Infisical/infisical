import { SecretSharingAccessType } from "@app/hooks/api/secretSharing/types";
import type {
  TAccessSharedSecretResponse,
  TBrandingConfig,
  TGetSecretRequestByIdResponse,
  TSharedSecret,
  TSharedSecretPublicDetails
} from "@app/hooks/api/secretSharing/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { SAMPLE_BRAND_PRIMARY, SAMPLE_BRAND_SECONDARY } from "../../secret-sharing/public/shared";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { SecretSharingAdapter, SecretSharingPublicAdapter } from "./contract";

const loadedAt = Date.now();
const at = (minutes: number) => new Date(loadedAt + minutes * 60_000);
const HOUR = 60;
const DAY = 24 * HOUR;

const row = (
  index: number,
  fields: Partial<TSharedSecret> & Pick<TSharedSecret, "name" | "createdAt" | "expiresAt">
): TSharedSecret => ({
  id: `5e000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  userId: "demo-user",
  orgId: V4_DEMO_ORG_ID,
  updatedAt: fields.createdAt,
  accessType: SecretSharingAccessType.Organization,
  expiresAfterViews: null,
  encryptedValue: "",
  encryptedSecret: "",
  iv: "",
  tag: "",
  ...fields
});

const sharedSecrets = createFixtureStore<TSharedSecret[]>([
  row(1, {
    name: "Stripe restricted key",
    createdAt: at(-2 * HOUR),
    expiresAt: at(5 * DAY),
    expiresAfterViews: 1
  }),
  row(2, {
    name: "Staging database password",
    createdAt: at(-26 * HOUR),
    expiresAt: at(6 * DAY),
    lastViewedAt: at(-20 * HOUR),
    accessType: SecretSharingAccessType.Anyone
  }),
  row(3, {
    name: "Datadog API key",
    createdAt: at(-3 * DAY),
    expiresAt: at(-2 * DAY),
    lastViewedAt: at(-3 * DAY + 40)
  }),
  row(4, {
    name: null,
    createdAt: at(-4 * DAY),
    expiresAt: at(10 * DAY),
    expiresAfterViews: 0,
    lastViewedAt: at(-4 * DAY + 90)
  }),
  row(5, {
    name: "Vendor SFTP credentials",
    createdAt: at(-9 * DAY),
    expiresAt: at(21 * DAY),
    expiresAfterViews: 3,
    accessType: SecretSharingAccessType.Anyone
  })
]);

const secretRequests = createFixtureStore<(TSharedSecret & { secretValue?: string })[]>([
  row(11, {
    name: "Contractor GitHub token",
    createdAt: at(-90),
    expiresAt: at(7 * DAY - 90)
  }),
  {
    ...row(12, {
      name: "Partner webhook signing secret",
      createdAt: at(-30 * HOUR),
      expiresAt: at(13 * DAY),
      accessType: SecretSharingAccessType.Anyone,
      encryptedSecret: "provided"
    }),
    secretValue: "replace-with-partner-signing-secret"
  },
  row(13, {
    name: null,
    createdAt: at(-8 * DAY),
    expiresAt: at(-1 * DAY),
    accessType: SecretSharingAccessType.Anyone
  })
]);

const branding = createFixtureStore<TBrandingConfig>({ hasLogo: false, hasFavicon: false });

const page = (rows: TSharedSecret[], { offset, limit }: { offset: number; limit: number }) => ({
  secrets: [...rows]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(offset, offset + limit),
  totalCount: rows.length
});

export const secretSharingDemo: SecretSharingAdapter = {
  useSharedSecrets: (dto) => ({
    data: page(sharedSecrets.use(), dto),
    isPending: false,
    error: null
  }),
  useSecretRequests: (dto) => ({
    data: page(secretRequests.use(), dto),
    isPending: false,
    error: null
  }),
  useCreateSharedSecret: fixtureMutation(({ name, expiresIn, maxViews, accessType }) => {
    const created = row(100 + sharedSecrets.get().length, {
      id: crypto.randomUUID(),
      name: name || null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (Number.parseInt(expiresIn, 10) || 1) * 3_600_000),
      expiresAfterViews: maxViews ?? null,
      accessType: accessType ?? SecretSharingAccessType.Anyone
    });
    sharedSecrets.update((rows) => [created, ...rows]);
    return { id: created.id };
  }),
  useCreateSecretRequest: fixtureMutation(({ name, accessType }) => {
    const created = row(200 + secretRequests.get().length, {
      id: crypto.randomUUID(),
      name: name || null,
      createdAt: new Date(),
      expiresAt: at(7 * DAY),
      accessType: accessType ?? SecretSharingAccessType.Anyone
    });
    secretRequests.update((rows) => [created, ...rows]);
    return { id: created.id };
  }),
  useDeleteSharedSecret: fixtureMutation(({ sharedSecretId }) =>
    sharedSecrets.update((rows) => rows.filter((entry) => entry.id !== sharedSecretId))
  ),
  useDeleteSecretRequest: fixtureMutation(({ secretRequestId }) =>
    secretRequests.update((rows) => rows.filter((entry) => entry.id !== secretRequestId))
  ),
  useRevealSecretRequestValue: fixtureMutation(({ id }) => {
    const found = secretRequests.get().find((entry) => entry.id === id);
    if (!found) throw new Error("Secret request not found");
    return { ...found, secretValue: found.secretValue ?? "" };
  }),
  useBrandingEntitlement: () => ({ data: true, isPending: false, error: null }),
  useBrandingConfig: () => ({ data: branding.use(), isPending: false, error: null }),
  useBrandingAsset: () => ({ data: null, isPending: false, error: null }),
  useUploadBrandingAsset: fixtureMutation(({ assetType }) =>
    branding.update((current) => ({
      ...current,
      ...(assetType === "brand-logo" ? { hasLogo: true } : { hasFavicon: true })
    }))
  ),
  useDeleteBrandingAsset: fixtureMutation(({ assetType }) =>
    branding.update((current) => ({
      ...current,
      ...(assetType === "brand-logo" ? { hasLogo: false } : { hasFavicon: false })
    }))
  )
};

export type SecretSharingPreview = "secret" | "password" | "error" | "branded" | "answered";

const previewError = (statusCode: number, message: string) =>
  Object.assign(new Error(message), { response: { data: { statusCode, message } } });

const brand: TBrandingConfig = {
  hasLogo: false,
  hasFavicon: false,
  primaryColor: SAMPLE_BRAND_PRIMARY,
  secondaryColor: SAMPLE_BRAND_SECONDARY
};

const details = (preview: SecretSharingPreview): TSharedSecretPublicDetails => ({
  id: "demo",
  userId: null,
  orgId: null,
  createdAt: at(-HOUR).toISOString(),
  updatedAt: at(-HOUR).toISOString(),
  name: null,
  lastViewedAt: null,
  accessType: SecretSharingAccessType.Anyone,
  expiresAt: at(DAY).toISOString(),
  expiresAfterViews: 3,
  isPasswordProtected: preview === "password",
  isAuthorizedUser: true
});

const accessed: TAccessSharedSecretResponse = {
  secretValue: "DATABASE_URL=postgres://app:Xk29vQ7pLm@db.internal:5432/app",
  accessType: SecretSharingAccessType.Anyone,
  expiresAt: at(DAY).toISOString(),
  expiresAfterViews: 3
};

const secretRequest: TGetSecretRequestByIdResponse = {
  request: {
    id: "demo",
    orgId: V4_DEMO_ORG_ID,
    accessType: SecretSharingAccessType.Anyone,
    requester: { organizationName: "Acme", username: "maya@acme.dev" }
  },
  isSecretValueSet: false
};

const accessStore = createFixtureStore<{
  data: TAccessSharedSecretResponse | undefined;
  error: unknown;
}>({ data: undefined, error: null });
const useAccessStore = accessStore.use;

export const secretSharingPublicDemo = (
  preview: SecretSharingPreview
): SecretSharingPublicAdapter => ({
  useSharedSecretDetails: () =>
    preview === "error"
      ? {
          data: undefined,
          isPending: false,
          error: previewError(404, "The secret you are looking for is missing or has expired")
        }
      : { data: details(preview), isPending: false, error: null },
  useSharedSecretBranding: () => ({
    data: preview === "branded" ? brand : { hasLogo: false, hasFavicon: false },
    isPending: false,
    error: null
  }),
  useAccessSharedSecret: () => {
    const store = useAccessStore();
    return {
      mutate: ({ password }) =>
        accessStore.update(() =>
          preview === "password" && password !== "demo"
            ? { data: undefined, error: previewError(401, "Invalid credentials") }
            : { data: accessed, error: null }
        ),
      data: store.data,
      error: store.error,
      isPending: false,
      isError: Boolean(store.error)
    };
  },
  useCreatePublicSharedSecret: fixtureMutation(() => ({ id: crypto.randomUUID() })),
  brandingAssetUrl: () => "",
  useSecretRequest: () =>
    preview === "error"
      ? {
          data: {
            ...secretRequest,
            error: "The secret request you are looking for is missing or has expired."
          },
          isPending: false,
          error: null
        }
      : {
          data: {
            ...secretRequest,
            isSecretValueSet: preview === "answered",
            brandingConfig: preview === "branded" ? brand : undefined
          },
          isPending: false,
          error: null
        },
  useSetSecretRequestValue: fixtureMutation(() => undefined),
  requestBrandingAssetUrl: () => ""
});
