// 3.x lists no types in its package exports, so bundler resolution can't reach lib/index.d.ts. Remove once on 7.x.
declare module "mongodb-connection-string-url" {
  export default class ConnectionString extends URL {
    constructor(uri: string, options?: { looseValidation?: boolean });

    get isSRV(): boolean;

    get hosts(): string[];

    set hosts(list: string[]);
  }
}
