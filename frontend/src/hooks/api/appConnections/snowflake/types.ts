export type TSnowflakeDatabase = {
  name: string;
};

export type TSnowflakeSchema = {
  name: string;
};

export type TListSnowflakeSchemas = {
  connectionId: string;
  database: string;
};
