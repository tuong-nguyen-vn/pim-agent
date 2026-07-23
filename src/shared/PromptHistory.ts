import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { Fs } from "./Fs";

const MAX_ENTRIES = 200;

export class PromptHistory {
  public static path(): string {
    return join(getAgentDir(), "prompt-history.json");
  }

  public static async load(): Promise<string[]> {
    return Fs.readJsonOrEmpty<string[]>(PromptHistory.path(), []);
  }

  private static writeQueue: Promise<unknown> = Promise.resolve();

  /** Persist the editor's newest-first history array (overwrites the file). */
  public static persist(entriesNewestFirst: readonly string[]): void {
    // Stored oldest -> newest on disk so the file reads naturally and replays
    // in the same order addToHistory() was originally called.
    const oldestFirst = [...entriesNewestFirst].reverse().slice(-MAX_ENTRIES);
    PromptHistory.writeQueue = PromptHistory.writeQueue.then(() =>
      Fs.writeAtomic(PromptHistory.path(), JSON.stringify(oldestFirst))
    );
  }
}
