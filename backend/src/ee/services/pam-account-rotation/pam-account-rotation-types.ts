import { z } from "zod";

import { PasswordRequirementsSchema } from "@app/ee/services/secret-rotation-v2/shared/general/password-requirements-schema";

export type TGetPamAccountRotationDTO = {
  accountId: string;
  projectId: string;
};

export type TSetPamRotationAccountDTO = {
  accountId: string;
  rotationAccountId: string | null;
  projectId: string;
};

export type TRotatePamAccountDTO = {
  accountId: string;
  projectId: string;
};

export type TListPamRotationCandidatesDTO = {
  accountId: string;
  projectId: string;
};

export type TPamAccountRotationView = {
  enabled: boolean;
  intervalSeconds: number | null;
  passwordRequirements: z.infer<typeof PasswordRequirementsSchema> | null;
  rotationAccountId: string | null;
  rotationAccountName: string | null;
  lastRotatedAt: Date | null;
  rotationStatus: string | null;
  lastRotationError: string | null;
  isReady: boolean;
};
