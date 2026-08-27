export enum GcpCertificateManagerScope {
  Default = "default",
  EdgeCache = "edge-cache",
  AllRegions = "all-regions",
  ClientAuth = "client-auth"
}

export enum GcpCertificateManagerAction {
  Get = "get",
  List = "list",
  Create = "create",
  Update = "update",
  Delete = "delete"
}

export enum GcpErrorStatus {
  PermissionDenied = "PERMISSION_DENIED",
  NotFound = "NOT_FOUND",
  AlreadyExists = "ALREADY_EXISTS",
  ResourceExhausted = "RESOURCE_EXHAUSTED",
  FailedPrecondition = "FAILED_PRECONDITION",
  InvalidArgument = "INVALID_ARGUMENT"
}
