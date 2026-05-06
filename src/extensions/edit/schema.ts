import { type Static, Type } from "typebox";

export const editSchema = Type.Object({
  path: Type.String({
    description:
      "Path to the file to edit. Relative paths resolve against the working directory.",
  }),
  edits: Type.Array(
    Type.Object(
      {
        op: Type.Union(
          [
            Type.Literal("replace"),
            Type.Literal("append"),
            Type.Literal("prepend"),
          ],
          {
            description:
              "`replace` replaces the line at `pos`, or the inclusive range `pos`..`end`, with `content`. `append` inserts `content` after `pos` - omit `pos` to append at EOF. `prepend` inserts `content` before `pos` - omit `pos` to insert at BOF.",
          }
        ),
        pos: Type.Optional(
          Type.String({
            description:
              "Single-line anchor copied verbatim from hashline `read`. Format: `LINE+ID` (eg. `42sr`) or `LINE+ID|content` (eg. `42sr|  return value;`). For multiline edits, set `pos` to the first line's anchor and `end` to the last line's anchor.",
          })
        ),
        end: Type.Optional(
          Type.String({
            description:
              "Single-line anchor for the last line of a range replace. Must be on or after `pos`. Omit for single-line replace.",
          })
        ),
        content: Type.String({
          description:
            "Input string for this edit. Use newline-delimited string for multiple lines. Empty string deletes the target range.",
        }),
      },
      { additionalProperties: false }
    ),
    {
      minItems: 1,
      description:
        "Non-empty atomic batch of edits. Anchors must come from the same pre-edit read and must not overlap.",
    }
  ),
});

export type EditInput = Static<typeof editSchema>;

export type RawEdit = EditInput["edits"][number];
