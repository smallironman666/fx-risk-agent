/**
 * FallbackLLMBackend 单元测试
 *
 * 运行方式：npx ts-node test/ts/fallbackBackend.test.ts
 */

import * as assert from "assert";
import { FallbackLLMBackend } from "../../src/agent/llm/fallbackBackend";
import {
  BackendKind,
  BackendUnavailableError,
  ChatRequest,
  ChatResponse,
  LLMBackend,
} from "../../src/agent/llm/types";

class MockBackend implements LLMBackend {
  public calls = 0;
  constructor(
    public readonly kind: BackendKind,
    private readonly behavior:
      | { type: "ok"; content: string }
      | { type: "throw"; error: Error }
  ) {}

  public get label(): string {
    return `${this.kind}/mock`;
  }

  public async chat(_req: ChatRequest): Promise<ChatResponse> {
    this.calls++;
    if (this.behavior.type === "throw") throw this.behavior.error;
    return {
      content: this.behavior.content,
      model: "mock",
      usage: { promptTokens: 1, completionTokens: 1 },
      actualBackend: this.kind,
    };
  }
}

function req(): ChatRequest {
  return { messages: [{ role: "user", content: "hello" }] };
}

async function run() {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.log(`  ✗ ${name}`);
      console.log(`      ${err.message}`);
      failed++;
    }
  }

  console.log("FallbackLLMBackend tests:");

  await test("primary 成功 → 不触发 fallback", async () => {
    const primary = new MockBackend("0g-compute", { type: "ok", content: "primary-ok" });
    const fallback = new MockBackend("doubao", { type: "ok", content: "fallback-ok" });
    const wrapper = new FallbackLLMBackend(primary, fallback);

    const res = await wrapper.chat(req());

    assert.strictEqual(res.content, "primary-ok");
    assert.strictEqual(res.actualBackend, "0g-compute");
    assert.strictEqual(res.fallbackReason, undefined, "无 fallbackReason");
    assert.strictEqual(primary.calls, 1);
    assert.strictEqual(fallback.calls, 0, "fallback 未被调用");
  });

  await test("primary 抛 BackendUnavailableError → 切 fallback 并带 reason", async () => {
    const primary = new MockBackend("0g-compute", {
      type: "throw",
      error: new BackendUnavailableError("0g-compute", "Request timeout after 30000ms"),
    });
    const fallback = new MockBackend("doubao", { type: "ok", content: "fallback-ok" });
    const wrapper = new FallbackLLMBackend(primary, fallback);

    const res = await wrapper.chat(req());

    assert.strictEqual(res.content, "fallback-ok");
    assert.strictEqual(res.actualBackend, "doubao");
    assert.ok(
      res.fallbackReason?.includes("timeout"),
      "fallbackReason 应包含 timeout 原因"
    );
    assert.strictEqual(primary.calls, 1);
    assert.strictEqual(fallback.calls, 1);
  });

  await test("primary 抛普通 Error → 也切 fallback", async () => {
    const primary = new MockBackend("0g-compute", {
      type: "throw",
      error: new Error("network unreachable"),
    });
    const fallback = new MockBackend("doubao", { type: "ok", content: "fallback-ok" });
    const wrapper = new FallbackLLMBackend(primary, fallback);

    const res = await wrapper.chat(req());

    assert.strictEqual(res.actualBackend, "doubao");
    assert.ok(res.fallbackReason?.includes("network unreachable"));
  });

  await test("两个都挂 → 抛带双份原因的错误", async () => {
    const primary = new MockBackend("0g-compute", {
      type: "throw",
      error: new BackendUnavailableError("0g-compute", "primary down"),
    });
    const fallback = new MockBackend("doubao", {
      type: "throw",
      error: new BackendUnavailableError("doubao", "fallback down"),
    });
    const wrapper = new FallbackLLMBackend(primary, fallback);

    let caught: Error | undefined;
    try {
      await wrapper.chat(req());
    } catch (err: any) {
      caught = err;
    }

    assert.ok(caught, "应抛错");
    assert.ok(
      caught?.message.includes("primary down") && caught?.message.includes("fallback down"),
      "错误消息应同时包含两份原因"
    );
    assert.strictEqual(primary.calls, 1);
    assert.strictEqual(fallback.calls, 1);
  });

  await test("wrapper 的 label 包含两个后端", async () => {
    const primary = new MockBackend("0g-compute", { type: "ok", content: "x" });
    const fallback = new MockBackend("doubao", { type: "ok", content: "y" });
    const wrapper = new FallbackLLMBackend(primary, fallback);

    assert.ok(wrapper.label.includes("0g-compute"));
    assert.ok(wrapper.label.includes("doubao"));
    assert.ok(wrapper.label.includes("fallback"));
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
