import { Bot as Grammy } from "grammy";

import type { TelegramConfig } from "./Config.ts";

export class Bot {
  private readonly grammy: Grammy;
  private readonly allowSet: ReadonlySet<number>;

  public constructor(config: TelegramConfig) {
    this.grammy = new Grammy(config.token);
    this.allowSet = new Set(config.allow);

    this.grammy.on("message", async (ctx) => {
      const chatId = ctx.chat.id;
      if (!this.allowSet.has(chatId)) {
        return;
      }
      await ctx.reply("ok");
    });

    this.grammy.catch((err) => {
      console.error("[bot] handler error:", err.error);
    });
  }

  public async run(): Promise<void> {
    await this.grammy.init();
    const username = this.grammy.botInfo.username;
    console.log(`bot @${username} ready`);
    await this.grammy.start({ drop_pending_updates: true });
  }

  public async stop(): Promise<void> {
    await this.grammy.stop();
  }
}
