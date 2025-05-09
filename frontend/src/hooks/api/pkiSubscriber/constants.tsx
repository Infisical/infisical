export enum PkiSubscriberStatus {
  ACTIVE = "active",
  DISABLED = "disabled"
}

export const pkiSubscriberStatusToNameMap: { [K in PkiSubscriberStatus]: string } = {
  [PkiSubscriberStatus.ACTIVE]: "Active",
  [PkiSubscriberStatus.DISABLED]: "Disabled"
};

export const getPkiSubscriberStatusBadgeVariant = (status: PkiSubscriberStatus) => {
  switch (status) {
    case PkiSubscriberStatus.ACTIVE:
      return "success";
    case PkiSubscriberStatus.DISABLED:
      return "danger";
    default:
      return "primary";
  }
};
