import * as grapheneLib from "graphene-pk11";

export type HsmModule = {
  module: grapheneLib.Module | null;
  graphene: typeof grapheneLib;
};

export enum RequiredMechanisms {
  AesGcm = "AES_GCM",
  AesKeyWrap = "AES_KEY_WRAP"
}
