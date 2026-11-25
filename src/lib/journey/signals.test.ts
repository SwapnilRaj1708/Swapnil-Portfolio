import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSimpleView } from "@/lib/simple-view";
import { addContextLoss, getLowFailed, LOW_FAILED_KEY, resetSessionMemoryForTests, setLowFailed } from "./session";
import { probeWebGl2, readCapabilitySignals, readStaticSignals } from "./signals";
import { findStaticReason } from "./tiers";

// How each static trigger is detected in the browser (signals.ts), and how the WebGL 2 probe
// reads a context – jsdom has no WebGL, so the canvas is stubbed.

function stubMatchMedia(matching: string[]) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: matching.includes(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  resetSessionMemoryForTests();
  setSimpleView(false);
  stubMatchMedia([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "connection");
  Reflect.deleteProperty(navigator, "deviceMemory");
});

describe("static triggers", () => {
  it("none by default", () => {
    expect(findStaticReason(readStaticSignals(false))).toBeNull();
  });

  it("simple view (the remembered switch)", () => {
    setSimpleView(true);
    expect(findStaticReason(readStaticSignals(false))).toBe("simple-view");
  });

  it("reduced motion (prefers-reduced-motion: reduce)", () => {
    stubMatchMedia(["(prefers-reduced-motion: reduce)"]);
    expect(findStaticReason(readStaticSignals(false))).toBe("reduced-motion");
  });

  it("data saver (navigator.connection.saveData)", () => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
    expect(findStaticReason(readStaticSignals(false))).toBe("save-data");
  });

  it("no data saver when the browser has no Network Information API", () => {
    expect(readStaticSignals(false).saveData).toBe(false);
  });

  it("the graphics context lost twice in this session (not once)", () => {
    addContextLoss();
    expect(findStaticReason(readStaticSignals(false))).toBeNull();
    addContextLoss();
    expect(findStaticReason(readStaticSignals(false))).toBe("context-lost");
  });

  it("the 3D chunk failed to load", () => {
    expect(findStaticReason(readStaticSignals(true))).toBe("chunk-failed");
  });

  it("matchMedia missing or throwing reads as no preference", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("no");
    });
    expect(readStaticSignals(false).reducedMotion).toBe(false);
  });
});

type FakeContext = { getExtension: (name: string) => unknown; getParameter: (p: unknown) => unknown; RENDERER: number };
type ContextAttributes = { failIfMajorPerformanceCaveat?: boolean; powerPreference?: string };

/** Stubs the probe's canvas; returns every attribute set getContext("webgl2") was called with. */
function stubCanvas(contexts: { withCaveat: FakeContext | null; without: FakeContext | null }): ContextAttributes[] {
  const calls: ContextAttributes[] = [];
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
    if (tag !== "canvas") return create(tag, options);
    return {
      getContext: (kind: string, attrs?: ContextAttributes) => {
        if (kind !== "webgl2") return null;
        calls.push({ ...attrs });
        return attrs?.failIfMajorPerformanceCaveat ? contexts.withCaveat : contexts.without;
      },
    } as unknown as HTMLCanvasElement;
  });
  return calls;
}

function context(renderer: string, lose = vi.fn()): FakeContext {
  return {
    RENDERER: 0x1f01,
    getExtension: (name: string) =>
      name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : name === "WEBGL_lose_context" ? { loseContext: lose } : null,
    getParameter: (p: unknown) => (p === 0x9246 ? renderer : "WebKit WebGL"),
  };
}

describe("the WebGL 2 probe", () => {
  it("no WebGL 2 context at all → no WebGL 2", () => {
    stubCanvas({ withCaveat: null, without: null });
    expect(probeWebGl2("high-performance")).toEqual({ webgl2: false, renderer: null, softwareRenderer: false });
  });

  it("a hardware context: its renderer, and the context is released", () => {
    const lose = vi.fn();
    const gl = context("ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)", lose);
    stubCanvas({ withCaveat: gl, without: gl });
    expect(probeWebGl2("high-performance")).toEqual({
      webgl2: true,
      renderer: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
      softwareRenderer: false,
    });
    expect(lose).toHaveBeenCalledOnce();
  });

  it.each(["high-performance", "low-power"] as const)("asks for the canvas's GPU (powerPreference %s), first with the performance caveat", (preference) => {
    const gl = context("Some GPU");
    const calls = stubCanvas({ withCaveat: gl, without: gl });
    probeWebGl2(preference);
    expect(calls).toEqual([{ failIfMajorPerformanceCaveat: true, powerPreference: preference }]);
  });

  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
  ])("%j → a software renderer", (renderer) => {
    const gl = context(renderer);
    stubCanvas({ withCaveat: gl, without: gl });
    expect(probeWebGl2("high-performance").softwareRenderer).toBe(true);
  });

  it("refused with failIfMajorPerformanceCaveat but given without → a software renderer", () => {
    const calls = stubCanvas({ withCaveat: null, without: context("Some GPU") });
    expect(probeWebGl2("high-performance")).toMatchObject({ webgl2: true, softwareRenderer: true });
    expect(calls).toEqual([
      { failIfMajorPerformanceCaveat: true, powerPreference: "high-performance" },
      { failIfMajorPerformanceCaveat: false, powerPreference: "high-performance" },
    ]);
  });
});

describe("the low-tier failure (session)", () => {
  it("is a static trigger once recorded, and stays for the session", () => {
    expect(readStaticSignals(false).lowFailed).toBe(false);
    setLowFailed();
    expect(window.sessionStorage.getItem(LOW_FAILED_KEY)).toBe("1");
    expect(findStaticReason(readStaticSignals(false))).toBe("low-failed");
    // A reload of the session: the in-memory copy is gone, sessionStorage still has it.
    resetSessionMemoryForTests();
    expect(getLowFailed()).toBe(true);
  });

  it("is kept in memory for the page when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getLowFailed()).toBe(false);
    expect(() => setLowFailed()).not.toThrow();
    expect(getLowFailed()).toBe(true);
    expect(findStaticReason(readStaticSignals(false))).toBe("low-failed");
  });

  it("ignores a stored value other than 1", () => {
    window.sessionStorage.setItem(LOW_FAILED_KEY, "yes");
    expect(getLowFailed()).toBe(false);
  });
});

describe("capability signals", () => {
  it("reads touch, screen, memory and cores", () => {
    stubMatchMedia(["(pointer: coarse)"]);
    Object.defineProperty(navigator, "deviceMemory", { value: 4, configurable: true });
    vi.spyOn(window.screen, "width", "get").mockReturnValue(390);
    vi.spyOn(window.screen, "height", "get").mockReturnValue(844);
    expect(readCapabilitySignals()).toMatchObject({ coarsePointer: true, screenShortSide: 390, deviceMemory: 4 });
  });

  it("an unknown value is null, not zero", () => {
    vi.spyOn(window.screen, "width", "get").mockReturnValue(0);
    const signals = readCapabilitySignals();
    expect(signals.deviceMemory).toBeNull();
    expect(signals.screenShortSide).toBeNull();
  });
});
