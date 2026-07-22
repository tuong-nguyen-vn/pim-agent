import { describe, expect, test } from "bun:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getTotalCost } from "./index";

function assistant(cost: number): unknown {
  return {
    type: "message",
    message: {
      role: "assistant",
      usage: {
        cost: {
          total: cost,
        },
      },
    },
  };
}

describe("getTotalCost", () => {
  test("sums assistant costs across all session entries", () => {
    const ctx = {
      sessionManager: {
        getEntries: () => [
          assistant(1.25),
          {
            type: "message",
            message: {
              role: "user",
            },
          },
          assistant(2.5),
        ],
      },
    } as unknown as ExtensionContext;

    expect(getTotalCost(ctx)).toBe(3.75);
  });
});
