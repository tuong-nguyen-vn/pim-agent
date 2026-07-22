import { type Static, Type } from "typebox";

export const subagentSchema = Type.Object({
  agent: Type.Optional(
    Type.String({
      description:
        'Name of a predefined agent from ~/.pi/agent/agents or the project\'s .pi/agents. Use "Search" for broad codebase discovery and "Oracle" for deep technical reasoning, architecture, planning, or review. Omit only for a plain isolated subagent that should inherit the current model, prompt, and active tools.',
    })
  ),
  prompt: Type.String({
    minLength: 1,
  }),
});

export type SubagentInput = Static<typeof subagentSchema>;
