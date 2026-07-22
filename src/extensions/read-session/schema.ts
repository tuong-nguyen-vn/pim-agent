import { type Static, Type } from "typebox";

export const readSessionSchema = Type.Object({
  id: Type.String({
    minLength: 1,
    description:
      "Exact session ID from an @@session:<id> reference in the current workspace.",
  }),
});

export type ReadSessionInput = Static<typeof readSessionSchema>;
