import { describe, expect, it } from "vitest";
import {
  chooseGpuPreference,
  chooseStartTier,
  decideTier,
  findStaticReason,
  isSoftwareRenderer,
  lowerOf,
  parseTierOverride,
  staticReasonForWebGl2,
  stepDown,
  TIER_LIMITS,
  type CapabilitySignals,
  type ProbeResult,
  type StaticSignals,
  type Tier,
} from "./tiers";

const laptop: CapabilitySignals = {
  coarsePointer: false,
  screenShortSide: 1080,
  deviceMemory: 8,
  hardwareConcurrency: 12,
};

describe("the start tier", () => {
  it.each<[string, Partial<CapabilitySignals>, string, string]>([
    ["a capable laptop", {}, "high", "capable device"],
    ["a laptop where memory and cores are unknown (Safari, Firefox)", { deviceMemory: null, hardwareConcurrency: null }, "high", "capable device"],
    ["a phone", { coarsePointer: true, screenShortSide: 390 }, "low", "phone"],
    ["a phone whose screen size is unknown", { coarsePointer: true, screenShortSide: null }, "low", "phone"],
    ["a tablet", { coarsePointer: true, screenShortSide: 820 }, "medium", "tablet"],
    ["4 GB of memory", { deviceMemory: 4 }, "medium", "4 GB memory"],
    ["2 GB of memory", { deviceMemory: 2 }, "medium", "2 GB memory"],
    ["4 cores", { hardwareConcurrency: 4 }, "medium", "4 cores"],
    ["8 GB and 6 cores", { deviceMemory: 8, hardwareConcurrency: 6 }, "high", "capable device"],
  ])("%s → %s", (_, override, tier, reason) => {
    expect(chooseStartTier({ ...laptop, ...override })).toEqual({ tier, reason });
  });
});

describe("tier steps", () => {
  it("steps down one tier at a time and stops at low", () => {
    expect(stepDown("high")).toBe("medium");
    expect(stepDown("medium")).toBe("low");
    expect(stepDown("low")).toBe("low");
  });

  it("never starts above a floor", () => {
    expect(lowerOf("high", null)).toBe("high");
    expect(lowerOf("high", "medium")).toBe("medium");
    expect(lowerOf("medium", "high")).toBe("medium");
    expect(lowerOf("low", "medium")).toBe("low");
  });

  it("uses the STANDARDS §3 limits", () => {
    expect(TIER_LIMITS).toEqual({
      high: { pixelRatio: 2, frameTimeP95Ms: 16.7 },
      medium: { pixelRatio: 1.5, frameTimeP95Ms: 20 },
      low: { pixelRatio: 1, frameTimeP95Ms: 33 },
    });
  });
});

describe("the ?tier= override", () => {
  it.each(["high", "medium", "low", "static"])("honours ?tier=%s where allowed", (tier) => {
    expect(parseTierOverride(`?tier=${tier}`, true)).toBe(tier);
    expect(parseTierOverride(`?a=1&tier=${tier}`, true)).toBe(tier);
  });

  it.each(["high", "medium", "low", "static"])("ignores ?tier=%s on the production deployment", (tier) => {
    expect(parseTierOverride(`?tier=${tier}`, false)).toBeNull();
  });

  it.each(["", "?tier=", "?tier=ultra", "?tier=HIGH", "?other=high"])("ignores %j", (search) => {
    expect(parseTierOverride(search, true)).toBeNull();
  });
});

const NO_SIGNALS: StaticSignals = {
  simpleView: false,
  reducedMotion: false,
  saveData: false,
  contextLostTwice: false,
  chunkFailed: false,
  lowFailed: false,
};

describe("the static triggers", () => {
  const none = NO_SIGNALS;

  it("none applies → no static reason", () => {
    expect(findStaticReason(none)).toBeNull();
  });

  it.each<[keyof StaticSignals, string]>([
    ["simpleView", "simple-view"],
    ["reducedMotion", "reduced-motion"],
    ["saveData", "save-data"],
    ["contextLostTwice", "context-lost"],
    ["chunkFailed", "chunk-failed"],
    ["lowFailed", "low-failed"],
  ])("%s alone → %s", (signal, reason) => {
    expect(findStaticReason({ ...none, [signal]: true })).toBe(reason);
  });

  it("reports the first that applies, in a fixed order (the visitor's own choice first)", () => {
    expect(
      findStaticReason({ simpleView: true, reducedMotion: true, saveData: true, contextLostTwice: true, chunkFailed: true, lowFailed: true }),
    ).toBe("simple-view");
    expect(findStaticReason({ ...none, reducedMotion: true, saveData: true })).toBe("reduced-motion");
    expect(findStaticReason({ ...none, saveData: true, chunkFailed: true })).toBe("save-data");
    expect(findStaticReason({ ...none, contextLostTwice: true, chunkFailed: true })).toBe("context-lost");
    expect(findStaticReason({ ...none, chunkFailed: true, lowFailed: true })).toBe("chunk-failed");
  });

  it("no WebGL 2 → static", () => {
    expect(staticReasonForWebGl2(false)).toBe("no-webgl2");
    expect(staticReasonForWebGl2(true)).toBeNull();
  });
});

describe("the software-renderer list", () => {
  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "Google SwiftShader",
    "SWIFTSHADER",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "Mesa softpipe",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Software Rasterizer",
    "ANGLE (Unknown, Software Adapter, D3D11)",
  ])("%j is software", (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(true);
  });

  it.each([
    "ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001636) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F91) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Apple GPU",
    "Adreno (TM) 730",
    "Mali-G78",
    "WebKit WebGL",
  ])("%j is hardware", (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(false);
  });

  it("an unknown renderer (null, empty) is not software", () => {
    expect(isSoftwareRenderer(null)).toBe(false);
    expect(isSoftwareRenderer("")).toBe(false);
  });
});

describe("the GPU preference", () => {
  it("visitors get high-performance", () => {
    expect(chooseGpuPreference("", true)).toBe("high-performance");
    expect(chooseGpuPreference("?tier=high", true)).toBe("high-performance");
  });

  it("?gpu=low-power asks for the integrated GPU where the override is allowed", () => {
    expect(chooseGpuPreference("?gpu=low-power", true)).toBe("low-power");
    expect(chooseGpuPreference("?tier=high&gpu=low-power", true)).toBe("low-power");
  });

  it("is ignored on the production deployment", () => {
    expect(chooseGpuPreference("?gpu=low-power", false)).toBe("high-performance");
    expect(chooseGpuPreference("?tier=low&gpu=low-power", false)).toBe("high-performance");
  });

  it.each(["?gpu=", "?gpu=LOW-POWER", "?gpu=default", "?gpu=high-performance", "?gpu=integrated"])("ignores %j", (search) => {
    expect(chooseGpuPreference(search, true)).toBe("high-performance");
  });
});

describe("the whole decision (decideTier)", () => {
  const hardware: ProbeResult = { webgl2: true, softwareRenderer: false };
  const software: ProbeResult = { webgl2: true, softwareRenderer: true };
  const noWebGl2: ProbeResult = { webgl2: false, softwareRenderer: false };
  const FORCED = ["high", "medium", "low"] as const;

  function decide(override: Tier | null, probe: ProbeResult, signals: Partial<StaticSignals> = {}, capabilities: Partial<CapabilitySignals> = {}) {
    let probed = 0;
    const decision = decideTier({
      override,
      staticSignals: { ...NO_SIGNALS, ...signals },
      probe: () => {
        probed++;
        return probe;
      },
      capabilities: () => ({ ...laptop, ...capabilities }),
    });
    return { ...decision, probed };
  }

  it("a capable laptop on a hardware renderer → high", () => {
    expect(decide(null, hardware)).toEqual({ tier: "high", reason: "capable device", forced: false, probed: 1 });
  });

  it("a phone on a hardware renderer → low", () => {
    expect(decide(null, hardware, {}, { coarsePointer: true, screenShortSide: 390 })).toMatchObject({ tier: "low", reason: "phone", forced: false });
  });

  it("a software renderer → static, whatever the device", () => {
    expect(decide(null, software)).toEqual({ tier: "static", reason: "software-renderer", forced: false, probed: 1 });
    expect(decide(null, software, {}, { coarsePointer: true, screenShortSide: 390 })).toMatchObject({ tier: "static", reason: "software-renderer" });
  });

  it("frame time failed at low earlier in the session → static, without creating a context", () => {
    expect(decide(null, hardware, { lowFailed: true })).toEqual({ tier: "static", reason: "low-failed", forced: false, probed: 0 });
  });

  it("no WebGL 2 → static", () => {
    expect(decide(null, noWebGl2)).toMatchObject({ tier: "static", reason: "no-webgl2" });
  });

  it("the cheap triggers decide before any context is created", () => {
    expect(decide(null, hardware, { reducedMotion: true })).toEqual({ tier: "static", reason: "reduced-motion", forced: false, probed: 0 });
  });

  it.each(FORCED)("?tier=%s bypasses the software renderer (the canvas runs on SwiftShader)", (tier) => {
    expect(decide(tier, software)).toEqual({ tier, reason: "override", forced: true, probed: 1 });
  });

  it.each(FORCED)("?tier=%s bypasses the session's low-tier failure", (tier) => {
    expect(decide(tier, hardware, { lowFailed: true })).toEqual({ tier, reason: "override", forced: true, probed: 1 });
  });

  it.each(FORCED)("?tier=%s does not bypass no WebGL 2: static, quietly", (tier) => {
    expect(decide(tier, noWebGl2)).toEqual({ tier: "static", reason: "no-webgl2", forced: false, probed: 1 });
    expect(decide(tier, noWebGl2, { lowFailed: true })).toMatchObject({ tier: "static", reason: "no-webgl2" });
  });

  it.each(FORCED)("?tier=%s does not bypass the visitor's own choices or the other triggers", (tier) => {
    expect(decide(tier, hardware, { simpleView: true })).toMatchObject({ tier: "static", reason: "simple-view" });
    expect(decide(tier, hardware, { reducedMotion: true })).toMatchObject({ tier: "static", reason: "reduced-motion" });
    expect(decide(tier, hardware, { saveData: true })).toMatchObject({ tier: "static", reason: "save-data" });
    expect(decide(tier, hardware, { contextLostTwice: true })).toMatchObject({ tier: "static", reason: "context-lost" });
    expect(decide(tier, hardware, { chunkFailed: true })).toMatchObject({ tier: "static", reason: "chunk-failed" });
  });

  it("?tier=static → static, forced, without creating a context", () => {
    expect(decide("static", hardware)).toEqual({ tier: "static", reason: "override", forced: true, probed: 0 });
  });

  it("on the production deployment the override is never parsed, so nothing is bypassed", () => {
    const override = parseTierOverride("?tier=high", false);
    expect(override).toBeNull();
    expect(decide(override, software)).toMatchObject({ tier: "static", reason: "software-renderer" });
    expect(decide(override, hardware, { lowFailed: true })).toMatchObject({ tier: "static", reason: "low-failed" });
  });
});
