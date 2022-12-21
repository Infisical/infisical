import RequestError, { LogLevel, RequestErrorContext } from "./requestError"

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