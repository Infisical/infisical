export enum PkiItemType {
  CERTIFICATE = "certificate",
  CA = "ca"
}

export const pkiItemTypeToNameMap: { [K in PkiItemType]: string } = {
  [PkiItemType.CA]: "CA",
  [PkiItemType.CERTIFICATE]: "Certificate"
};
