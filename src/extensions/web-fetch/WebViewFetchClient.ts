import { platform } from "node:os";
import type { WebFetchPage } from "./fetch";

export type WebViewLike = {
  readonly url: string;
  readonly title: string;
  navigate: (url: string) => Promise<void>;
  evaluate: <T = unknown>(script: string) => Promise<T>;
  close: () => void;
};

export type WebViewFactory = () => WebViewLike;

type WebViewFetchClientOptions = {
  readonly factory?: WebViewFactory;
  readonly timeoutMs?: number;
};

type WebViewFetchInput = {
  readonly url: string;
  readonly signal?: AbortSignal;
};

class WebViewFetchClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WebViewFetchClientError";
  }
}

export class WebViewFetchClient {
  private static readonly defaultTimeoutMs = 20_000;

  private readonly factory: WebViewFactory;
  private readonly timeoutMs: number;

  public constructor(options: WebViewFetchClientOptions = {}) {
    this.factory = options.factory ?? WebViewFetchClient.defaultFactory;
    this.timeoutMs = options.timeoutMs ?? WebViewFetchClient.defaultTimeoutMs;
  }

  private static defaultFactory(): WebViewLike {
    return new Bun.WebView(
      platform() === "darwin" ? undefined : { backend: "chrome" }
    );
  }

  public async fetchUrl(input: WebViewFetchInput): Promise<WebFetchPage> {
    const signal = input.signal;

    if (signal?.aborted) {
      throw new WebViewFetchClientError("WebView request aborted.");
    }

    let view: WebViewLike;

    try {
      view = this.factory();
    } catch (error) {
      throw new WebViewFetchClientError(
        `WebView is unavailable: ${describeError(error)}`
      );
    }

    let aborted = false;
    let timedOut = false;
    const onAbort = () => {
      aborted = true;
      WebViewFetchClient.safeClose(view);
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      WebViewFetchClient.safeClose(view);
    }, this.timeoutMs);

    const checkInterrupted = (): void => {
      if (timedOut) {
        throw new WebViewFetchClientError(
          `WebView request timed out after ${this.timeoutMs}ms.`
        );
      }
      if (aborted) {
        throw new WebViewFetchClientError("WebView request aborted.");
      }
    };

    try {
      await view.navigate(input.url);
      checkInterrupted();

      const snapshot = await view.evaluate<unknown>(
        "({ html: document.documentElement.outerHTML, title: document.title })"
      );
      const { html, title } = WebViewFetchClient.readSnapshot(snapshot);

      if (html.trim().length === 0) {
        throw new WebViewFetchClientError("WebView returned empty HTML.");
      }

      const finalUrl = view.url.length > 0 ? view.url : input.url;

      return { title, url: finalUrl, content: html };
    } catch (error) {
      checkInterrupted();

      if (error instanceof WebViewFetchClientError) {
        throw error;
      }

      throw new WebViewFetchClientError(
        `WebView request failed: ${describeError(error)}`
      );
    } finally {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", onAbort);
      WebViewFetchClient.safeClose(view);
    }
  }

  private static readSnapshot(value: unknown): {
    html: string;
    title: string;
  } {
    if (typeof value !== "object" || value === null) {
      throw new WebViewFetchClientError(
        "WebView returned an unexpected page snapshot."
      );
    }

    const record = value as Record<string, unknown>;

    if (typeof record["html"] !== "string") {
      throw new WebViewFetchClientError(
        "WebView returned an unexpected page snapshot."
      );
    }

    return {
      html: record["html"],
      title: typeof record["title"] === "string" ? record["title"] : "",
    };
  }

  private static safeClose(view: WebViewLike): void {
    try {
      view.close();
    } catch {
      // close() throws if already closed; treat as idempotent.
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
