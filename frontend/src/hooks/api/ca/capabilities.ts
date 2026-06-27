import { CaType } from "./enums";

export type CaIssuanceCapabilities = {
  requiresHsm: boolean;
  supportsExistingOrderReuse: boolean;
};

export const getCaIssuanceCapabilities = (caType?: CaType): CaIssuanceCapabilities => {
  switch (caType) {
    case CaType.DIGICERT:
      return { requiresHsm: true, supportsExistingOrderReuse: true };
    default:
      return { requiresHsm: false, supportsExistingOrderReuse: false };
  }
};
