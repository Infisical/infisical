import picomatch from "picomatch";
import { z } from "zod";

export type TBuildProjectPermissionDTO = {
  permissions?: unknown;
  role: string;
}[];

export type TBuildOrgPermissionDTO = {
  permissions?: unknown;
  role: string;
}[];

export enum PermissionConditionOperators {
  $IN = "$in",
  $ALL = "$all",
  $REGEX = "$regex",
  $EQ = "$eq",
  $NEQ = "$neq",
  $GLOB = "$glob"
}

export const PermissionConditionSchema = {
  [PermissionConditionOperators.$IN]: z.string().array(),
  [PermissionConditionOperators.$ALL]: z.string().array(),
  [PermissionConditionOperators.$REGEX]: z.string().refine(
    (el) => {
      try {
        // eslint-disable-next-line no-new
        new RegExp(el);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid regex pattern" }
  ),
  [PermissionConditionOperators.$EQ]: z.string(),
  [PermissionConditionOperators.$NEQ]: z.string(),
  [PermissionConditionOperators.$GLOB]: z.string().refine(
    (el) => {
      try {
        picomatch.parse([el]);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid glob pattern" }
  )
};
