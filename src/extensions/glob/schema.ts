import { type Static, Type } from "typebox";

export const GLOB_HEAD_LIMIT_MAX = 1000;

export const globSchema = Type.Object({
  pattern: Type.String({
    description: "Glob pattern relative to path (eg. **/*.ts).",
  }),
  path: Type.Optional(
    Type.String({
      description:
        "Root directory to search. Defaults to the current working directory.",
    })
  ),
  headLimit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: GLOB_HEAD_LIMIT_MAX,
      description: `Maximum returned entries. Defaults to ${GLOB_HEAD_LIMIT_MAX}.`,
    })
  ),
});

export type GlobInput = Static<typeof globSchema>;
