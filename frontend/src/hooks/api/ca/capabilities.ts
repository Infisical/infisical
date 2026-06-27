import { CaType } from "./enums";

export type CaIssuanceCapabilities = {
  requiresHsm: boolean;
  supportsExistingOrderReuse: boolean;
  minRsaKeyBits?: number;
};

export const getCaIssuanceCapabilities = (caType?: CaType): CaIssuanceCapabilities => {
  switch (caType) {
    case CaType.DIGICERT:
      return { requiresHsm: true, supportsExistingOrderReuse: true, minRsaKeyBits: 3072 };
    default:
      return { requiresHsm: false, supportsExistingOrderReuse: false };
  }
};
