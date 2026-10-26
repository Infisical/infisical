import { accountRotationViews } from "./types/accounts";
import { cloudRotationViews } from "./types/cloud";
import { providerRotationViews } from "./types/providers";
import { sqlRotationViews } from "./types/sql";
import type { RotationViews } from "./fields";
import type { SecretRotation } from "./schemas";

export const ROTATION_VIEWS: Record<SecretRotation, RotationViews> = {
  ...sqlRotationViews,
  ...providerRotationViews,
  ...cloudRotationViews,
  ...accountRotationViews
};
