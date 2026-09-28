import { z } from "zod";

import { TGenericPermission } from "@app/lib/types";
import {
  PkiAlertV2ResponseSchema,
  TAlertV2Response,
  TCreatePkiAlertV2,
  TGetAlertV2DTO,
  TListAlertsV2DTO,
  TUpdateAlertV2DTO
} from "@app/services/pki-alert-v2/pki-alert-v2-types";

export const PkiAlertRouteResponseSchema = PkiAlertV2ResponseSchema.extend({
  applicationId: z.string().uuid().nullable().optional()
});

export type TPkiAlertRouteResponse = TAlertV2Response & {
  applicationId: string | null;
  applicationName?: string | null;
};

type TApplicationScope = { applicationId?: string };

export type TCreatePkiAlertRouteDTO = TGenericPermission & { projectId: string } & TApplicationScope &
  TCreatePkiAlertV2;

export type TGetPkiAlertRouteDTO = TGetAlertV2DTO & TApplicationScope;

export type TUpdatePkiAlertRouteDTO = TUpdateAlertV2DTO & TApplicationScope;

export type TListPkiAlertsRouteDTO = TListAlertsV2DTO & TApplicationScope;
