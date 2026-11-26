// @vitest-environment node
import { BoxGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import { SHADER_NAMES } from "@/lib/journey/assets/shader-names";
import { REVISION } from "three";
import { BASIS_TRANSCODER_DIR, DECODER_DIR, MESHOPT_DECODER_URL } from "../decoders";
import { fallbackShaderMaterial, libraryLookup, SHADER_LIBRARY } from "./library";

// STANDARDS.md §4: one shader library, each shader with a low-tier variant and documented uniforms.

describe("shader library", () => {
  it("has exactly the names the pipeline checks against (shader-names.ts)", () => {
    expect(Object.keys(SHADER_LIBRARY).sort()).toEqual([...SHADER_NAMES].sort());
    for (const name of SHADER_NAMES) expect(libraryLookup(name)?.name).toBe(name);
    expect(libraryLookup("nope")).toBeUndefined();
  });

  it.each(SHADER_NAMES)("%s documents every uniform it declares and builds a high and a low variant", (name) => {
    const definition = SHADER_LIBRARY[name];
    expect(definition.description.length).toBeGreaterThan(10);
    for (const tier of ["high", "medium", "low"] as const) {
      const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name: `SHADER_${name}` }));
      const material = definition.create({ source: mesh.material, mesh, tier }) as ShaderMaterial;
      expect(Object.keys(material.uniforms).sort()).toEqual(Object.keys(definition.uniforms).sort());
      expect("LOW_TIER" in material.defines).toBe(tier === "low");
      // Tone-mapped and colour-managed like every other surface.
      expect(material.fragmentShader).toContain("#include <tonemapping_fragment>");
      expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    }
  });

  it("test_grid reads the mask's red (ramp) and green (border) and marks the geometric centre", () => {
    const mesh = new Mesh(new BoxGeometry(0.8, 0.5, 0.02).translate(0, 0.5, -0.3), new MeshStandardMaterial({ name: "SHADER_test_grid" }));
    const material = SHADER_LIBRARY.test_grid.create({ source: mesh.material, mesh, tier: "high" }) as ShaderMaterial;
    expect(material.vertexShader).toContain("color.r");
    expect(material.fragmentShader).toContain("step(0.5, vMask.g)");
    expect(material.fragmentShader).toContain("abs(ramp - 0.5)");
    expect(material.uniforms.uCentreX.value).toBeCloseTo(0, 6);
  });

  it("fallbacks: development amber wireframe, production plain", () => {
    expect((fallbackShaderMaterial("x", true) as MeshBasicMaterial).wireframe).toBe(true);
    expect((fallbackShaderMaterial("x", false) as MeshBasicMaterial).wireframe).toBe(false);
  });
});

describe("decoder paths", () => {
  it("are the site's own, named after the installed three.js revision (scripts/copy-decoders.mjs writes there)", () => {
    expect(DECODER_DIR).toBe(`/decoders/three-r${REVISION}/`);
    expect(BASIS_TRANSCODER_DIR).toBe(`/decoders/three-r${REVISION}/basis/`);
    expect(MESHOPT_DECODER_URL).toBe(`/decoders/three-r${REVISION}/meshopt_decoder.module.js`);
    for (const url of [DECODER_DIR, BASIS_TRANSCODER_DIR, MESHOPT_DECODER_URL]) expect(url.startsWith("/")).toBe(true);
  });
});
