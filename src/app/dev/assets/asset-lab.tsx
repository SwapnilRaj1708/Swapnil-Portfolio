"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MutableRefObject } from "react";
import {
  Box3,
  Euler,
  Group,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
  type Object3D,
  type Texture,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useStore } from "zustand";
import { AssetManager } from "@/components/journey/assets/asset-manager";
import { ASSETS_DEV } from "@/components/journey/assets/chapter-assets";
import { nodeName, texturesOf, type ContractAsset, type ContractMeshInfo } from "@/components/journey/assets/contract";
import { libraryLookup } from "@/components/journey/assets/shaders/library";
import { estimateTextureBytes, textureBytes } from "@/components/journey/scene/stats";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { assetUrl, findAsset, variantForTier, type AssetVariant } from "@/lib/journey/assets/manifest";
import { listPoints, pointsStore, type AssetPoint } from "@/lib/journey/assets/points";
import { journeyOverrides } from "@/lib/journey/overrides";
import { loadingFraction, loadingStore, type LoadingState } from "@/lib/journey/store";
import { isRenderTier, TIER_LIMITS, type RenderTier, type Tier } from "@/lib/journey/tiers";
import { PALETTE } from "@/styles/palette";

/**
 * The asset lab (PF-009, dev-only route /dev/assets): `shared/pipeline-test` loaded by the site's
 * own AssetManager (the same loaders, decoders, contract and disposal the journey uses), with
 * OrbitControls, a clip scrubber, the tier switch (high and medium → `-high`, low → `-low`, static →
 * nothing), load / unload, DOM labels on the anchors, hotspots and glow accents, and readouts of
 * everything the contract produced and of the renderer's counters. `window.__assetLab` lets the
 * browser tests and review captures drive it.
 */

const ASSET_KEY = "shared/pipeline-test";
const TIERS: Tier[] = ["high", "medium", "low", "static"];
const CLIP_OBJECT = "shared_test_cube";

type LabState = "idle" | "loading" | "loaded" | "unloaded" | "failed" | "static";

export type LabSnapshot = {
  state: LabState;
  tier: Tier;
  variant: AssetVariant | null;
  url: string | null;
  meshes: ContractMeshInfo[];
  instances: { prop: string; source: string; count: number }[];
  clips: { name: string; duration: number }[];
  memory: { geometries: number; textures: number; programs: number };
  baseline: { geometries: number; textures: number } | null;
  render: { calls: number; triangles: number };
  textures: { name: string; width: number; height: number; compressed: boolean; colorSpace: string; gpuBytes: number; rgba8Bytes: number }[];
  textureBytes: number;
  textureBytesRgba8: number;
  renderer: string | null;
};

type LabController = {
  /** Sets the tier the next load uses (at once – not through a React effect). */
  setTier: (tier: Tier) => void;
  load: () => Promise<boolean>;
  unload: () => void;
  scrub: (progress: number) => void;
  view: (name: "overview" | "shader" | "top") => void;
  snapshot: () => LabSnapshot;
  cube: () => { y: number; turnDegrees: number } | null;
};

type LabHooks = Omit<LabController, "setTier"> & {
  ready: boolean;
  setTier: (tier: Tier) => Promise<void>;
  setUnknownShader: (on: boolean) => Promise<void>;
  progressEvents: number[];
};

declare global {
  interface Window {
    __assetLab?: LabHooks;
  }
}

const EMPTY_SNAPSHOT: LabSnapshot = {
  state: "idle",
  tier: "high",
  variant: null,
  url: null,
  meshes: [],
  instances: [],
  clips: [],
  memory: { geometries: 0, textures: 0, programs: 0 },
  baseline: null,
  render: { calls: 0, triangles: 0 },
  textures: [],
  textureBytes: 0,
  textureBytesRgba8: 0,
  renderer: null,
};

function startTier(): Tier {
  const forced = journeyOverrides().tier;
  return forced ?? "high";
}

const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`;
const mb = (n: number) => `${(n / 1_000_000).toFixed(2)} MB`;

function rendererName(gl: { getContext: () => WebGLRenderingContext | WebGL2RenderingContext }): string | null {
  try {
    const context = gl.getContext();
    const info = context.getExtension("WEBGL_debug_renderer_info");
    return String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER));
  } catch {
    return null;
  }
}

/** The scene side: the manager, the controls, the label projection, the snapshot. */
function LabScene({
  tier,
  unknownShader,
  controllerRef,
  labelsRef,
  onChange,
}: {
  tier: Tier;
  unknownShader: MutableRefObject<boolean>;
  controllerRef: MutableRefObject<LabController | null>;
  labelsRef: MutableRefObject<Map<string, HTMLElement>>;
  onChange: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useRef<OrbitControls | null>(null);
  const tierRef = useRef(tier);
  const baseline = useRef<{ geometries: number; textures: number } | null>(null);
  const holder = useMemo(() => new Group(), []);
  const state = useRef<LabState>("idle");
  const projected = useMemo(() => new Vector3(), []);
  const points = useRef<AssetPoint[]>([]);

  useEffect(() => {
    tierRef.current = tier;
  }, [tier]);

  useEffect(() => {
    const update = () => {
      points.current = listPoints("anchor").concat(listPoints("hotspot"), listPoints("glow"));
    };
    update();
    return pointsStore.subscribe(update);
  }, []);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.target.set(0.15, 0.3, 0);
    c.update();
    controls.current = c;
    return () => {
      c.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    scene.add(holder);
    const renderTier = (): RenderTier => (isRenderTier(tierRef.current) ? tierRef.current : "low");
    const manager = new AssetManager({
      renderer: gl,
      parent: holder,
      dev: ASSETS_DEV,
      tier: renderTier,
      shaders: (name) => (unknownShader.current ? undefined : libraryLookup(name)),
      onChange,
    });
    const entry = findAsset(ASSET_KEY);
    const current = (): ContractAsset | null => manager.get(ASSET_KEY);
    const findObject = (name: string): Object3D | null => {
      let found: Object3D | null = null;
      holder.traverse((o) => {
        if (!found && nodeName(o) === name) found = o;
      });
      return found;
    };
    const frame = (box: Box3, direction: Vector3) => {
      const centre = box.getCenter(new Vector3());
      const radius = box.getSize(new Vector3()).length() / 2;
      const distance = (radius / Math.sin(((camera.fov / 2) * Math.PI) / 180)) * 0.78;
      camera.position.copy(centre).addScaledVector(direction.normalize(), distance);
      controls.current?.target.copy(centre);
      controls.current?.update();
    };

    // three r187 uploads one shared lookup texture (DFG_LUT) the first time a lit (standard)
    // material renders, and keeps it for every later one: the renderer's, not an asset's. One
    // throwaway lit draw puts it in place before the baseline is read – the journey canvas has it
    // from its first frame (its test object is lit).
    const warmUp = () => {
      const probeScene = new Scene();
      const probe = new Mesh(new PlaneGeometry(0.01, 0.01), new MeshStandardMaterial());
      probe.position.set(0, 0, -1);
      probeScene.add(probe);
      gl.render(probeScene, new PerspectiveCamera());
      probe.geometry.dispose();
      probe.material.dispose();
    };

    const controller: LabController = {
      setTier(next) {
        tierRef.current = next;
      },
      async load() {
        const variant = variantForTier(tierRef.current);
        if (!entry) return false;
        if (!variant) {
          manager.unload(ASSET_KEY);
          state.current = "static";
          onChange();
          return false;
        }
        if (!baseline.current) {
          warmUp();
          baseline.current = { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
        }
        state.current = "loading";
        onChange();
        const asset = await manager.load(entry, variant);
        state.current = asset ? "loaded" : "failed";
        onChange();
        return !!asset;
      },
      unload() {
        manager.unload(ASSET_KEY);
        state.current = variantForTier(tierRef.current) ? "unloaded" : "static";
        onChange();
      },
      scrub(progress) {
        current()?.scrub(progress);
      },
      view(name) {
        const asset = current();
        if (!asset) return;
        if (name === "shader") {
          const panel = findObject("shared_test_panel");
          if (panel) frame(new Box3().setFromObject(panel), new Vector3(0, 0.08, 1));
          return;
        }
        frame(new Box3().setFromObject(asset.root), name === "top" ? new Vector3(0.001, 1, 0.12) : new Vector3(0.55, 0.42, 0.8));
      },
      snapshot() {
        const asset = current();
        const variant = manager.variantOf(ASSET_KEY);
        const textures = new Map<Texture, string>();
        holder.traverse((o) => {
          const material = (o as { material?: unknown }).material;
          const list = Array.isArray(material) ? material : material ? [material] : [];
          for (const m of list) for (const t of texturesOf(m)) textures.set(t, t.name || m.name);
        });
        const textureRows = [...textures.keys()].map((t) => {
          const image = t.image as { width?: number; height?: number } | null;
          const width = image?.width ?? 0;
          const height = image?.height ?? 0;
          const compressed = (t as Texture & { isCompressedTexture?: boolean }).isCompressedTexture === true;
          const levels = Math.floor(Math.log2(Math.max(1, width, height))) + 1;
          let rgba8 = 0;
          for (let i = 0; i < levels; i++) rgba8 += Math.max(1, width >> i) * Math.max(1, height >> i) * 4;
          return { name: textures.get(t) ?? "", width, height, compressed, colorSpace: t.colorSpace, gpuBytes: textureBytes(t), rgba8Bytes: rgba8 };
        });
        return {
          state: state.current,
          tier: tierRef.current,
          variant,
          url: entry && variant ? assetUrl(entry, variant) : null,
          meshes: asset?.meshes ?? [],
          instances: asset?.instances.map(({ prop, source, count }) => ({ prop, source, count })) ?? [],
          clips: asset?.clips ?? [],
          memory: { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? 0 },
          baseline: baseline.current,
          render: { calls: gl.info.render.calls, triangles: gl.info.render.triangles },
          textures: textureRows.sort((a, b) => a.name.localeCompare(b.name)),
          textureBytes: estimateTextureBytes(holder),
          textureBytesRgba8: textureRows.reduce((s, t) => s + t.rgba8Bytes, 0),
          renderer: rendererName(gl),
        };
      },
      cube() {
        const cube = findObject(CLIP_OBJECT);
        if (!cube) return null;
        const turn = new Euler().setFromQuaternion(new Quaternion().copy(cube.quaternion), "YXZ").y;
        return { y: cube.position.y, turnDegrees: (turn * 180) / Math.PI };
      },
    };
    controllerRef.current = controller;
    void controller.load().then(() => controller.view("overview"));
    return () => {
      controllerRef.current = null;
      manager.dispose();
      scene.remove(holder);
    };
    // The manager lives as long as the canvas; tier changes go through load()/unload().
  }, [gl, scene, holder, camera, onChange, unknownShader, controllerRef]);

  useFrame(() => {
    controls.current?.update();
    for (const p of points.current) {
      const el = labelsRef.current.get(`${p.kind}:${p.name}`);
      if (!el) continue;
      projected.set(p.position[0], p.position[1], p.position[2]).project(camera);
      const visible = projected.z > -1 && projected.z < 1;
      el.style.visibility = visible ? "visible" : "hidden";
      el.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px)`;
    }
  });

  return null;
}

export function AssetLab() {
  const [tier, setTier] = useState<Tier>(startTier);
  const [snapshot, setSnapshot] = useState<LabSnapshot>(EMPTY_SNAPSHOT);
  const [clip, setClip] = useState(0);
  const [unknownShaderOn, setUnknownShaderOn] = useState(false);
  const unknownShader = useRef(false);
  const controllerRef = useRef<LabController | null>(null);
  const labelsRef = useRef(new Map<string, HTMLElement>());
  const points = useStore(pointsStore, (s) => s.byAsset);
  const loading = useStore(loadingStore, (s) => s);
  const [ready, setReady] = useState(false);
  const progressEvents = useRef<number[]>([]);
  const gpu = useMemo(() => journeyOverrides().gpu, []);
  const pixelRatio = isRenderTier(tier) ? TIER_LIMITS[tier].pixelRatio : 1;

  const refresh = useCallback(() => {
    const c = controllerRef.current;
    if (c) setSnapshot(c.snapshot());
  }, []);

  // Counters at 4 Hz (dev page: React state is fine here, never in the frame loop).
  useEffect(() => {
    const id = window.setInterval(refresh, 250);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Every progress update, for the browser test (real streamed bytes, not one jump).
  useEffect(
    () =>
      loadingStore.subscribe((s: LoadingState) => {
        const a = s.assets[ASSET_KEY];
        if (a) progressEvents.current.push(a.loaded);
      }),
    [],
  );

  const changeTier = useCallback(async (next: Tier) => {
    setTier(next);
    const c = controllerRef.current;
    if (!c) return;
    c.setTier(next);
    c.unload();
    if (variantForTier(next)) {
      await c.load();
      setClip(0);
    }
  }, []);

  const changeUnknown = useCallback(async (on: boolean) => {
    unknownShader.current = on;
    setUnknownShaderOn(on);
    const c = controllerRef.current;
    if (!c) return;
    c.unload();
    await c.load();
    setClip(0);
  }, []);

  useEffect(() => {
    window.__assetLab = {
      get ready() {
        return ready;
      },
      load: () => controllerRef.current?.load() ?? Promise.resolve(false),
      unload: () => controllerRef.current?.unload(),
      scrub: (p) => {
        setClip(p);
        controllerRef.current?.scrub(p);
      },
      view: (name) => controllerRef.current?.view(name),
      snapshot: () => controllerRef.current?.snapshot() ?? EMPTY_SNAPSHOT,
      cube: () => controllerRef.current?.cube() ?? null,
      setTier: changeTier,
      setUnknownShader: changeUnknown,
      progressEvents: progressEvents.current,
    };
    return () => {
      delete window.__assetLab;
    };
  }, [ready, changeTier, changeUnknown]);

  const onClip = (event: ChangeEvent<HTMLInputElement>) => {
    const p = Number(event.target.value);
    setClip(p);
    controllerRef.current?.scrub(p);
  };

  const allPoints = Object.values(points).flat();
  const anchorsAndHotspots = allPoints.filter((p) => p.kind !== "glow");
  const glows = allPoints.filter((p) => p.kind === "glow");
  const progress = loading.assets[ASSET_KEY];
  const clipInfo = snapshot.clips[0];
  const back = snapshot.baseline && snapshot.memory.geometries === snapshot.baseline.geometries && snapshot.memory.textures === snapshot.baseline.textures;

  return (
    <Container grid className="gap-y-6 pb-section">
      <div className="col-span-4 flex flex-col gap-4 md:col-span-8 lg:col-span-8">
        <div className="relative aspect-screen w-full overflow-hidden rounded-sm border border-line bg-background" data-asset-lab-canvas="">
          <Canvas
            dpr={[1, pixelRatio]}
            gl={{ antialias: tier !== "low", powerPreference: gpu, toneMapping: NeutralToneMapping }}
            camera={{ position: [1.3, 1.0, 1.9], fov: 35, near: 0.02, far: 50 }}
            onCreated={() => setReady(true)}
          >
            <color attach="background" args={[PALETTE.background]} />
            {/* Two runtime lights (D-16) for the PBR_ objects; BAKED_, GLOW_ and the shader ignore them. */}
            <hemisphereLight args={[PALETTE.text, PALETTE.background, 0.6]} />
            <directionalLight position={[2, 3, 2.5]} intensity={2.2} color={PALETTE["accent-signal"]} />
            <LabScene tier={tier} unknownShader={unknownShader} controllerRef={controllerRef} labelsRef={labelsRef} onChange={refresh} />
          </Canvas>
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {allPoints.map((p) => (
              <span
                key={`${p.kind}:${p.name}`}
                ref={(el) => {
                  const key = `${p.kind}:${p.name}`;
                  if (el) labelsRef.current.set(key, el);
                  else labelsRef.current.delete(key);
                }}
                data-point={p.name}
                className="invisible absolute top-0 left-0 flex items-center gap-1"
              >
                <span className={p.kind === "hotspot" ? "size-2 rounded-full bg-accent-signal" : "size-2 bg-accent-trace"} />
                <span className="label-mono rounded-xs border border-line bg-surface px-1 text-text">{p.name}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => void controllerRef.current?.load()} disabled={snapshot.state === "loading" || !variantForTier(tier)}>
            Load
          </Button>
          <Button size="sm" variant="secondary" onClick={() => controllerRef.current?.unload()}>
            Unload
          </Button>
          <Button size="sm" variant="ghost" onClick={() => controllerRef.current?.view("overview")}>
            View: overview
          </Button>
          <Button size="sm" variant="ghost" onClick={() => controllerRef.current?.view("shader")}>
            View: shader panel
          </Button>
          <Button size="sm" variant="ghost" onClick={() => controllerRef.current?.view("top")}>
            View: top
          </Button>
        </div>
        <label className="flex flex-col gap-2 text-sm text-text">
          <span className="label-mono text-text-muted">
            Clip {clipInfo ? `${clipInfo.name} · ${(clip * clipInfo.duration).toFixed(3)} s of ${clipInfo.duration.toFixed(3)} s` : "(none loaded)"} · progress {clip.toFixed(2)}
          </span>
          <input type="range" min={0} max={1} step={0.01} value={clip} onChange={onClip} disabled={!clipInfo} className="w-full accent-accent-trace" />
        </label>
      </div>

      <div className="col-span-4 flex flex-col gap-4 md:col-span-8 lg:col-span-4" data-asset-lab-readouts="">
        <Panel label="Asset">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-sm">
            <dt className="text-text-muted">State</dt>
            <dd data-readout="state">{snapshot.state}</dd>
            <dt className="text-text-muted">Tier → file</dt>
            <dd>
              {tier} → {snapshot.variant ? `-${snapshot.variant}` : "nothing"}
            </dd>
            <dt className="text-text-muted">Progress</dt>
            <dd data-readout="progress">
              {progress ? `${group(progress.loaded)} / ${group(progress.total)} B (${Math.round(loadingFraction(loading) * 100)} %)` : "–"}
            </dd>
            <dt className="text-text-muted">Renderer</dt>
            <dd className="break-words">{snapshot.renderer ?? "–"}</dd>
          </dl>
          <ChipGroup legend="Tier" className="mt-4">
            <div className="flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <Chip key={t} name="lab-tier" value={t} checked={tier === t} onChange={() => void changeTier(t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </ChipGroup>
          <div className="mt-4">
            <Chip type="checkbox" name="lab-unknown" value="on" checked={unknownShaderOn} onChange={(e) => void changeUnknown(e.target.checked)}>
              Pretend SHADER_test_grid is unknown
            </Chip>
          </div>
        </Panel>

        <Panel label="Meshes by contract kind">
          <ul className="flex flex-col gap-1 font-mono text-sm" data-readout="meshes">
            {snapshot.meshes.map((m) => (
              <li key={m.name} className="flex justify-between gap-3">
                <span>{m.name}</span>
                <span className="text-text-muted">
                  {m.kind}
                  {m.fallback ? " (fallback)" : ""} · {m.triangles} tri{m.copies > 1 ? ` × ${m.copies}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-sm text-text-muted" data-readout="instances">
            {snapshot.instances.map((i) => `INST_${i.prop}: ${i.count} instances of ${i.source} (source not drawn in place)`).join("; ") || "No instances."}
          </p>
        </Panel>

        <Panel label="Anchors, hotspots, glow accents">
          <ul className="flex flex-col gap-1 font-mono text-sm" data-readout="points">
            {[...anchorsAndHotspots, ...glows].map((p) => (
              <li key={`${p.kind}:${p.name}`} className="flex justify-between gap-3">
                <span>{p.name}</span>
                <span className="text-text-muted">{p.position.map((v) => v.toFixed(2)).join(", ")}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel label="Renderer">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-sm" data-readout="renderer">
            <dt className="text-text-muted">Geometries</dt>
            <dd data-readout="geometries">
              {snapshot.memory.geometries}
              {snapshot.baseline ? ` (baseline ${snapshot.baseline.geometries})` : ""}
            </dd>
            <dt className="text-text-muted">Textures</dt>
            <dd data-readout="textures">
              {snapshot.memory.textures}
              {snapshot.baseline ? ` (baseline ${snapshot.baseline.textures})` : ""}
            </dd>
            <dt className="text-text-muted">Programs</dt>
            <dd>{snapshot.memory.programs}</dd>
            <dt className="text-text-muted">Draw calls</dt>
            <dd data-readout="calls">{snapshot.render.calls}</dd>
            <dt className="text-text-muted">Triangles</dt>
            <dd data-readout="triangles">{group(snapshot.render.triangles)}</dd>
            <dt className="text-text-muted">Texture memory</dt>
            <dd data-readout="texture-memory">
              {mb(snapshot.textureBytes)} (RGBA8 would be {mb(snapshot.textureBytesRgba8)})
            </dd>
            <dt className="text-text-muted">At baseline now</dt>
            <dd data-readout="baseline">{snapshot.baseline ? (back ? "yes" : "no") : "–"}</dd>
          </dl>
          <ul className="mt-3 flex flex-col gap-1 font-mono text-sm text-text-muted">
            {snapshot.textures.map((t) => (
              <li key={t.name}>
                {t.name}: {t.width}² {t.compressed ? "compressed" : "RGBA8"} {t.colorSpace} · {kb(t.gpuBytes)}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Container>
  );
}
