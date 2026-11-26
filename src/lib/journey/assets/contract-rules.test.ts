import { describe, expect, it } from "vitest";
import { anchorChapterOf, clipObjectOf, emptyKind, instanceSourceName, isAssetSlug, isMeshName, materialKind, parseInstName, shaderNameOf } from "./contract-rules";

describe("asset contract names (STANDARDS.md §6)", () => {
  it("materials: the prefix decides the kind; lower-case words after it", () => {
    expect(materialKind("BAKED_pipeline_bench")).toBe("BAKED");
    expect(materialKind("PBR_test_metal")).toBe("PBR");
    expect(materialKind("SHADER_test_grid")).toBe("SHADER");
    expect(materialKind("GLOW_trace_amber")).toBe("GLOW");
    for (const bad of ["Material.001", "baked_x", "BAKED_", "BAKED_Bench", "PBR-metal", "GLOW_trace amber", "EMIT_x"]) expect(materialKind(bad)).toBeNull();
    expect(shaderNameOf("SHADER_test_grid")).toBe("test_grid");
    expect(shaderNameOf("PBR_test_grid")).toBeNull();
  });

  it("meshes: <chapter>_<element>[_<part>] in lower case", () => {
    expect(isMeshName("shared_bench_base", "shared")).toBe(true);
    expect(isMeshName("port_monolith", "port")).toBe(true);
    expect(isMeshName("port_monolith", "shared")).toBe(false);
    expect(isMeshName("shared_Bench", "shared")).toBe(false);
    expect(isMeshName("shared", "shared")).toBe(false);
  });

  it("empties: ANCHOR_<chapter>, HOTSPOT_<name>, INST_<prop>_<nnn>, GLOW_<name>", () => {
    expect(emptyKind("ANCHOR_shared", "shared")).toBe("ANCHOR");
    expect(emptyKind("ANCHOR_port", "shared")).toBeNull();
    expect(anchorChapterOf("ANCHOR_port")).toBe("port");
    expect(emptyKind("HOTSPOT_slot_03", "shared")).toBe("HOTSPOT");
    expect(emptyKind("INST_pin_001", "shared")).toBe("INST");
    expect(emptyKind("GLOW_accent_01", "shared")).toBe("GLOW");
    for (const bad of ["Empty", "HOTSPOT_", "INST_pin_1", "INST_pin_0001", "hotspot_slot_01"]) expect(emptyKind(bad, "shared")).toBeNull();
    expect(parseInstName("INST_pin_004")).toEqual({ prop: "pin", index: 4 });
    expect(parseInstName("INST_server_rack_012")).toEqual({ prop: "server_rack", index: 12 });
    expect(instanceSourceName("shared", "pin")).toBe("shared_pin");
  });

  it("clips: <object>_<verb>, the object being a node the clip animates", () => {
    expect(clipObjectOf("shared_test_cube_rise", ["shared_test_cube"])).toBe("shared_test_cube");
    expect(clipObjectOf("shared_test_cube_rise", ["shared_test", "shared_test_cube"])).toBe("shared_test_cube");
    expect(clipObjectOf("Action.001", ["shared_test_cube"])).toBeNull();
    expect(clipObjectOf("shared_test_cube", ["shared_test_cube"])).toBeNull();
    expect(clipObjectOf("shared_test_cube_rise_2", ["shared_test_cube"])).toBeNull();
  });

  it("slugs: lower-case words joined by hyphens", () => {
    expect(isAssetSlug("pipeline-test")).toBe(true);
    expect(isAssetSlug("Pipeline_test")).toBe(false);
  });
});
