import { z } from "zod";
import { ZZJobSpecBase } from "./ZZJobSpecBase";

export type InferStreamSetType<T> = T extends StreamDefSet<infer TMap>
  ? TMap
  : {};

// export type InferDefMap<TMap> = TMap extends {
//   [key in infer K]: z.ZodType<infer V>;
// }
//   ? {
//       [key in K]: z.ZodType<V>;
//     }
//   : never;

export type InferDefMap<TMap> = {
  [K in keyof TMap]: z.ZodType<TMap[K]>;
};

export class StreamDefSet<TMap> {
  public readonly defs: InferDefMap<TMap>;

  constructor({ defs }: { defs: InferDefMap<TMap> }) {
    this.defs = defs;
  }

  get keys() {
    return Object.keys(this.defs) as (keyof TMap)[];
  }

  get isSingle() {
    return Object.keys(this.defs).length === 1;
  }

  public hasDef = (key: string) => {
    return key in this.defs;
  };

  public getDef = <K extends keyof TMap>(key: K) => {
    if (!this.hasDef(key as string))
      throw new Error(`No def for key ${String(key)}`);
    const def = (this.defs as Record<keyof TMap, z.ZodType<TMap[keyof TMap]>>)[
      key as keyof TMap
    ] as z.ZodType<TMap[K]>;
    return def;
  };
}