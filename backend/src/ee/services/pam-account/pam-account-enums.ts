import { PamDomainType } from "../pam-domain/pam-domain-enums";
import { PamResource } from "../pam-resource/pam-resource-enums";

export type PamParentType = PamResource | PamDomainType;

export enum PamAccountOrderBy {
  Name = "name"
}

export enum PamAccountView {
  Flat = "flat",
  Nested = "nested"
}

export enum PamAccountRotationStatus {
  Rotating = "rotating",
  Success = "success",
  PartialSuccess = "partial-success",
  Failed = "failed"
}
