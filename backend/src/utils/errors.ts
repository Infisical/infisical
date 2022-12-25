import RequestError, { LogLevel, RequestErrorContext } from "./requestError"

//* ----->[GENERAL HTTP ERRORS]<-----
export const RouteNotFoundError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.INFO,
    statusCode: error?.statusCode ?? 404,
    type: error?.type ?? 'route_not_found',
    message: error?.message ?? 'The requested source was not found',
    context: error?.context,
    stack: error?.stack
})

export const MethodNotAllowedError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.INFO,
    statusCode: error?.statusCode ?? 405,
    type: error?.type ?? 'method_not_allowed',
    message: error?.message ?? 'The requested method is not allowed for the resource',
    context: error?.context,
    stack: error?.stack
})

export const UnauthorizedRequestError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.INFO,
    statusCode: error?.statusCode ?? 401,
    type: error?.type ?? 'unauthorized',
    message: error?.message ?? 'You are not authorized to access this resource',
    context: error?.context,
    stack: error?.stack
})
  
export const ForbiddenRequestError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.INFO,
    statusCode: error?.statusCode ?? 403,
    type: error?.type ?? 'forbidden',
    message: error?.message ?? 'You are not allowed to access this resource',
    context: error?.context,
    stack: error?.stack
})

export const BadRequestError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.INFO,
    statusCode: error?.statusCode ?? 400,
    type: error?.type ?? 'bad_request',
    message: error?.message ?? 'The request is invalid or cannot be served',
    context: error?.context,
    stack: error?.stack
})

export const InternalServerError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.ERROR,
    statusCode: error?.statusCode ?? 500,
    type: error?.type ?? 'internal_server_error',
    message: error?.message ?? 'The server encountered an error while processing the request',
    context: error?.context,
    stack: error?.stack
})

export const ServiceUnavailableError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.ERROR,
    statusCode: error?.statusCode ?? 503,
    type: error?.type ?? 'service_unavailable',
    message: error?.message ?? 'The service is currently unavailable. Please try again later.',
    context: error?.context,
    stack: error?.stack
})

export const ValidationError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.ERROR,
    statusCode: error?.statusCode ?? 400,
    type: error?.type ?? 'validation_error',
    message: error?.message ?? 'The request failed validation',
    context: error?.context,
    stack: error?.stack
})

//* ----->[INTEGRATION ERRORS]<-----
export const IntegrationNotFoundError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.ERROR,
    statusCode: error?.statusCode ?? 404,
    type: error?.type ?? 'integration_not_found_error',
    message: error?.message ?? 'The requested integration was not found',
    context: error?.context,
    stack: error?.stack
})

//* ----->[WORKSPACE ERRORS]<-----
export const WorkspaceNotFoundError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.ERROR,
    statusCode: error?.statusCode ?? 404,
    type: error?.type ?? 'workspace_not_found_error',
    message: error?.message ?? 'The requested workspace was not found',
    context: error?.context,
    stack: error?.stack
})

//* ----->[ORGANIZATION ERRORS]<-----
export const OrganizationNotFoundError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.ERROR,
    statusCode: error?.statusCode ?? 404,
    type: error?.type ?? 'organization_not_found_error',
    message: error?.message ?? 'The requested organization was not found',
    context: error?.context,
    stack: error?.stack
})

//* ----->[ACCOUNT ERRORS]<-----
export const AccountNotFoundError = (error?: Partial<RequestErrorContext>) => new RequestError({
    logLevel: error?.logLevel ?? LogLevel.ERROR,
    statusCode: error?.statusCode ?? 404,
    type: error?.type ?? 'account_not_found_error',
    message: error?.message ?? 'The requested account was not found',
    context: error?.context,
    stack: error?.stack
})

//* ----->[MISC ERRORS]<-----
