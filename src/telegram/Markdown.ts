export class Markdown {
  // TODO(phase-b): port miniclaw goldmark walker via Bun.markdown.render → Telegram HTML.
  public static toHtml(md: string): string {
    return md;
  }
}
