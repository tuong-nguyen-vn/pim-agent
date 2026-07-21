import { type Static, Type } from "typebox";

export const subagentSchema = Type.Object({
  agent: Type.Optional(
    Type.String({
      description:
        "Name of a predefined agent (from ~/.pi/agent/agents or the project's .pi/agents) to run with instead of the parent's default system prompt and tools. Omit for a plain subagent.",
    })
  ),
  prompt: Type.String({
    minLength: 1,
  }),
});

export type SubagentInput = Static<typeof subagentSchema>;
