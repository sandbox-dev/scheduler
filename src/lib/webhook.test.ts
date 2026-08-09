import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postWebhook } from "./webhook";

describe("postWebhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns true on the first clean 2xx response, with no retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postWebhook("test", "https://example.com/hook", { a: 1 });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: 1 }),
      })
    );
  });

  it("retries a non-ok response and succeeds if a later attempt returns ok", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const promise = postWebhook("test", "https://example.com/hook", {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a thrown network error (e.g. ECONNRESET) rather than failing immediately", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const promise = postWebhook("test", "https://example.com/hook", {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up and returns false after exhausting all retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    const promise = postWebhook("test", "https://example.com/hook", {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(false);
    // 1 initial attempt + 2 retries per RETRY_DELAYS_MS = 3 total calls.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never throws even when every attempt rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const promise = postWebhook("test", "https://example.com/hook", {});
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(false);
  });
});
