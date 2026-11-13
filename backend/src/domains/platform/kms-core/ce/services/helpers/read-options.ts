export enum ReadFrom {
  Replica = "replica",
  Primary = "primary"
}

export type TReadOptions = { readFrom?: ReadFrom };
