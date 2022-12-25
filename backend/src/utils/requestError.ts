import { Request } from 'express'
import { VERBOSE_ERROR_OUTPUT } from '../config'

export enum LogLevel {
    DEBUG = 100,
    INFO = 200,
    NOTICE = 250,
    WARNING = 300,
    ERROR = 400,
    CRITICAL = 500,
    ALERT = 550,
    EMERGENCY = 600,
}

export type RequestErrorContext =  {
	logLevel?: LogLevel,
	statusCode: number,
	type: string,
	message: string,
	context?: Record<string, unknown>,
	stack?: string|undefined
}

export default class RequestError extends Error{

    private _logLevel: LogLevel
    private _logName: string
    statusCode: number
    type: string
    context: Record<string, unknown>
    extra: Record<string, string|number|symbol>[]
    private stacktrace: string|undefined|string[]

    constructor(
        {logLevel, statusCode, type, message, context, stack} : RequestErrorContext
        ){
        super(message)
        this._logLevel = logLevel || LogLevel.INFO
        this._logName = LogLevel[this._logLevel]
        this.statusCode = statusCode
        this.type = type
        this.context = context || {}
        this.extra = []

        if(stack) this.stack = stack
        else Error.captureStackTrace(this, this.constructor)
        this.stacktrace = this.stack?.split('\n')
    }

    static convertFrom(error: Error) {
        //This error was not handled by error handler. Please report this incident to the staff.
        return new RequestError({
            logLevel: LogLevel.ERROR,
            statusCode: 500,
            type: 'internal_server_error',
            message: 'This error was not handled by error handler. Please report this incident to the staff',
            context: {
                message: error.message,
                name: error.name
            },
            stack: error.stack
        })
    }

    get level(){ return this._logLevel }
    get levelName(){ return this._logName }

    withTags(...tags: string[]|number[]){
        this.context['tags'] = Object.assign(tags, this.context['tags'])
        return this
    }

    withExtras(...extras: Record<string, string|boolean|number>[]){
        this.extra = Object.assign(extras, this.extra)
        return this
    }

    private _omit(obj: any, keys: string[]): typeof obj{
        const exclude = new Set(keys)
        obj = Object.fromEntries(Object.entries(obj).filter(e => !exclude.has(e[0])))
        return obj
    }

    public format(req: Request){
        let _context = Object.assign({
            stacktrace: this.stacktrace
        }, this.context)

        //* Omit sensitive information from context that can leak internal workings of this program if user is not developer
        if(!VERBOSE_ERROR_OUTPUT){
            _context = this._omit(_context, [
                'stacktrace',
                'exception',
            ])
        }

        const formatObject = {
            type: this.type,
            message: this.message,
            context: _context,
            level: this.level,
            level_name: this.levelName,
            status_code: this.statusCode,
            datetime_iso: new Date().toISOString(),
            application: process.env.npm_package_name || 'unknown',
            request_id: req.headers["Request-Id"],
            extra: this.extra
        }

        return formatObject

    }
}