import {
  AddEquation,
  AssetManager,
  BufferAttribute,
  BufferGeometry,
  Camera,
  ClampToEdgeWrapping,
  CustomBlending,
  DoubleSide,
  FrontSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  Matrix4,
  Mesh,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapNearestFilter,
  NoColorSpace,
  NormalBlending,
  OneFactor,
  ShaderMaterial,
  RepeatWrapping,
  Scene,
  Texture,
  SRGBColorSpace,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "@iwsdk/core";
import { TiltShaderLoader } from "three-icosa";

import { assetUrl } from "../app/asset-url.js";
import type { BrushInventoryEntry } from "./brush-inventory.js";
import {
  openBrushShaderCompatibility,
  type BrushShaderCompatibilityContext,
} from "./brush-shader-compatibility.js";
import {
  createBrushShaderMaterialDescriptor,
  prepareBrushShaderSource,
  resolveLoadedTextureTexelSize,
  OPENBRUSH_AMBIENT_LIGHT_COLOR,
  OPENBRUSH_FOG_COLOR,
  OPENBRUSH_SCENE_LIGHT_0_COLOR,
  OPENBRUSH_SCENE_LIGHT_0_MATRIX,
  OPENBRUSH_SCENE_LIGHT_1_COLOR,
  OPENBRUSH_SCENE_LIGHT_1_MATRIX,
  type BrushShaderMaterialDescriptor,
  type BrushBumpMappingMode,
} from "./brush-shader-materials.js";
import { createIwsdkTiltMaterial } from "./iwsdk-tilt-material.js";

const AUTHORITATIVE_BRUSH_ASSET_URL = assetUrl(
  "/openbrush/icosa-brushes/",
);
const AUTHORITATIVE_MATERIAL_GUIDS = new Set([
  "f72ec0e7-a844-4e38-82e3-140c44772699", // Oil Paint
  "f5c336cf-5108-4b40-ade9-c687504385ab", // Ink
  "75b32cf0-fdd6-4d89-a64b-e2a00b247b0f", // Thick Paint
  "b67c0e81-ce6d-40a8-aeb0-ef036b081aa3", // Wet Paint
  "d0262945-853c-4481-9cbd-88586bed93cb", // Duct Tape
  "f1114e2e-eb8d-4fde-915a-6e653b54e9f5", // Paper
  "dce872c2-7b49-4684-b59b-c45387949c5c", // Hypercolor
  "429ed64a-4e97-4466-84d3-145a861ef684", // Marker
  "d90c6ad8-af0f-4b54-b422-e0f92abe1b3c", // Tapered Marker
  "cf019139-d41c-4eb0-a1d0-5cf54b0a42f3", // Highlighter
  "2d35bcf0-e4d8-452c-97b1-3311be063130", // Flat
  "b468c1fb-f254-41ed-8ec9-57030bc5660c", // Tapered Flat
  "accb32f5-4509-454f-93f8-1df3fd31df1b", // Soft Highlighter
  "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62", // Light
  "cb92b597-94ca-4255-b017-0e3f42f12f9e", // Fire
  "ad1ad437-76e2-450d-a23a-e17f8310b960", // Rainbow
  "d229d335-c334-495a-a801-660ac8a87360", // Velvet Ink
  "10201aa3-ebc2-42d8-84b7-2e63f6eeb8ab", // Waveform
  "5347acf0-a8e2-47b6-8346-30c70719d763", // Wiggly Graphite
  "44bb800a-fbc3-4592-8426-94ecb05ddec3", // Streamers
  "700f3aa8-9a7c-2384-8b8a-ea028905dd8c", // Cel Vinyl
  "8dc4a70c-d558-4efd-a5ed-d4e860f40dc3", // Splatter
  "1161af82-50cf-47db-9706-0c3576d43c43", // Coarse Bristles
  "02ffb866-7fb2-4d15-b761-1012cefb1360", // Embers
  "70d79cca-b159-4f35-990c-f02193947fe8", // Smoke
  "0eb4db27-3f82-408d-b5a1-19ebd7d5b711", // Stars
  "89d104cd-d012-426b-b5b3-bbaee63ac43c", // Bubbles
  "6a1cf9f9-032c-45ec-9b1d-a6680bee30f7", // Dots
  "0d3889f3-3ede-470c-8af4-de4813306126", // Double Tapered Marker
  "0d3889f3-3ede-470c-8af4-f44813306126", // Double Tapered Flat
  "f6e85de3-6dcc-4e7f-87fd-cee8c3d25d51", // Electricity
  "b2ffef01-eaaa-4ab5-aa64-95a2c4f5dbc6", // Neon Pulse
  "4391aaaa-df81-4396-9e33-31e4e4930b27", // Light Wire
  "0f0ff7b2-a677-45eb-a7d6-0cd7206f4816", // Chromatic Wave
  "4391385a-df73-4396-9e33-31e4e4930b27", // Toon
  "4391385a-cf83-4396-9e33-31e4e4930b27", // Wire
  "cf7f0059-7aeb-53a4-2b67-c83d863a9ffa", // Spikes
  "4391aaaa-df73-4396-9e33-31e4e4930b27", // Disco
]);

interface UniformHolder {
  value: unknown;
}

function resolveRequestedBumpMappingMode(): BrushBumpMappingMode {
  if (typeof window === "undefined") {
    return "guarded";
  }
  return new URLSearchParams(window.location.search).get("bump-mapping") ===
    "fallback"
    ? "fallback"
    : "guarded";
}

/**
 * Loads and caches one ShaderMaterial per brush GUID from the extracted
 * Open Brush GLSL exports. Materials are shared across strokes; per-frame
 * state (time, camera-space light matrices) lives in uniform holder objects
 * shared by reference across all materials, so one update reaches everything.
 */
export class BrushShaderLibrary {
  private readonly materials = new Map<string, ShaderMaterial>();
  private readonly bakedMaterials = new Map<string, ShaderMaterial>();
  private readonly pending = new Map<string, Promise<ShaderMaterial | undefined>>();
  private readonly materialLoadedListeners = new Set<
    (guid: string, material: ShaderMaterial) => void
  >();
  private readonly lightWorld0 = new Matrix4().fromArray(OPENBRUSH_SCENE_LIGHT_0_MATRIX);
  private readonly lightWorld1 = new Matrix4().fromArray(OPENBRUSH_SCENE_LIGHT_1_MATRIX);
  private readonly viewMatrix = new Matrix4();
  private readonly tiltShaderLoader = new TiltShaderLoader(undefined, {
    materialFactory: createIwsdkTiltMaterial,
  }).setPath(AUTHORITATIVE_BRUSH_ASSET_URL);

  readonly frameUniforms = {
    u_time: { value: new Vector4(0, 0, 0, 0) },
    u_SceneLight_0_matrix: {
      value: new Matrix4().fromArray(OPENBRUSH_SCENE_LIGHT_0_MATRIX),
    },
    u_SceneLight_1_matrix: {
      value: new Matrix4().fromArray(OPENBRUSH_SCENE_LIGHT_1_MATRIX),
    },
    u_SceneLight_0_color: {
      value: new Vector4().fromArray(OPENBRUSH_SCENE_LIGHT_0_COLOR as number[]),
    },
    u_SceneLight_1_color: {
      value: new Vector4().fromArray(OPENBRUSH_SCENE_LIGHT_1_COLOR as number[]),
    },
    u_ambient_light_color: {
      value: new Vector4().fromArray(OPENBRUSH_AMBIENT_LIGHT_COLOR as number[]),
    },
    u_fogColor: { value: new Vector3().fromArray(OPENBRUSH_FOG_COLOR as number[]) },
    // ENVIRONMENT_STANDARD fog. ApplyFog multiplies by 10 internally, so this
    // lands at the same 0.0025/m the environment meshes use.
    u_fogDensity: { value: 0.00025 },
  };

  get(guid: string): ShaderMaterial | undefined {
    return this.materials.get(guid);
  }

  isManaged(material: unknown): boolean {
    for (const managed of this.materials.values()) {
      if (managed === material) {
        return true;
      }
    }
    return false;
  }

  subscribeMaterialLoaded(
    listener: (guid: string, material: ShaderMaterial) => void,
  ): () => void {
    this.materialLoadedListeners.add(listener);
    return () => this.materialLoadedListeners.delete(listener);
  }

  async load(
    entry: BrushInventoryEntry,
    options?: { allowAnyGeometry?: boolean },
  ): Promise<ShaderMaterial | undefined> {
    const allowAnyGeometry = options?.allowAnyGeometry === true;
    const targetMaterials = allowAnyGeometry
      ? this.bakedMaterials
      : this.materials;
    const cached = targetMaterials.get(entry.guid);
    if (cached) {
      return cached;
    }
    const pendingKey = `${allowAnyGeometry ? "baked" : "generated"}:${entry.guid}`;
    let promise = this.pending.get(pendingKey);
    if (!promise) {
      promise = this.createMaterial(entry, options, targetMaterials);
      this.pending.set(pendingKey, promise);
    }
    return promise;
  }

  /** Advance shared per-frame uniforms. Call once per frame before rendering. */
  updateFrame(timeSeconds: number, camera: Camera): void {
    // Same packing as packBrushShaderTime (Unity _Time), written in place so
    // the per-frame call allocates nothing.
    (this.frameUniforms.u_time.value as Vector4).set(
      timeSeconds / 20,
      timeSeconds,
      timeSeconds * 2,
      timeSeconds * 3,
    );
    this.viewMatrix.copy(camera.matrixWorld).invert();
    (this.frameUniforms.u_SceneLight_0_matrix.value as Matrix4).multiplyMatrices(
      this.viewMatrix,
      this.lightWorld0,
    );
    (this.frameUniforms.u_SceneLight_1_matrix.value as Matrix4).multiplyMatrices(
      this.viewMatrix,
      this.lightWorld1,
    );
  }

  /**
   * Pre-compile all cached materials so the first stroke of each brush does
   * not hitch. Uses KHR_parallel_shader_compile when available.
   */
  async warmUp(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    context: BrushShaderCompatibilityContext = renderer.xr.isPresenting
      ? "immersive-xr"
      : "browser",
  ): Promise<number> {
    const group = new Group();
    for (const material of this.materials.values()) {
      const mesh = new Mesh(createWarmupGeometry(), material);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    if (group.children.length === 0) {
      return 0;
    }
    try {
      // compileAsync needs KHR_parallel_shader_compile; probe silently to
      // avoid three's "extension not supported" warning and compile sync.
      const supportsParallelCompile = renderer
        .getContext()
        .getSupportedExtensions()
        ?.includes("KHR_parallel_shader_compile");
      if (supportsParallelCompile) {
        await renderer.compileAsync(group, camera, scene);
      } else {
        renderer.compile(group, camera, scene);
      }
      const rendererName = resolveRendererName(renderer);
      for (const [guid, material] of this.materials) {
        const failure = getMaterialCompileFailure(renderer, material);
        openBrushShaderCompatibility.record({
          guid,
          name: material.name.replace(/^OpenBrushShader_/, ""),
          context,
          status: failure ? "compile-failed" : "ready",
          renderer: rendererName,
          message: failure,
        });
      }
    } catch (error) {
      console.warn("OpenBrush shader warmup failed:", error);
      const message = toErrorMessage(error);
      const rendererName = resolveRendererName(renderer);
      for (const [guid, material] of this.materials) {
        openBrushShaderCompatibility.record({
          guid,
          name: material.name.replace(/^OpenBrushShader_/, ""),
          context,
          status: "compile-failed",
          renderer: rendererName,
          message,
        });
      }
    }
    for (const child of [...group.children]) {
      (child as Mesh).geometry.dispose();
      group.remove(child);
    }
    return this.materials.size;
  }

  private async createMaterial(
    entry: BrushInventoryEntry,
    options?: { allowAnyGeometry?: boolean },
    targetMaterials: Map<string, ShaderMaterial> = this.materials,
  ): Promise<ShaderMaterial | undefined> {
    if (AUTHORITATIVE_MATERIAL_GUIDS.has(entry.guid)) {
      return this.createAuthoritativeMaterial(entry, targetMaterials);
    }
    const descriptor = createBrushShaderMaterialDescriptor(entry, options);
    if (!descriptor) {
      return undefined;
    }
    try {
      const [vertexShader, fragmentShader, textures] = await Promise.all([
        fetchShaderSource(descriptor.vertexUrl),
        fetchShaderSource(descriptor.fragmentUrl),
        loadBrushTextures(descriptor),
      ]);
      // Non-raw ShaderMaterial is required for XR: super-three only applies
      // its GLSL3 conversion and OVR_multiview patching to non-raw programs.
      const material = new ShaderMaterial({
        name: `OpenBrushShader_${descriptor.name}`,
        vertexShader: prepareBrushShaderSource(
          vertexShader,
          resolveRequestedBumpMappingMode(),
        ),
        fragmentShader: prepareBrushShaderSource(
          fragmentShader,
          resolveRequestedBumpMappingMode(),
        ),
        uniforms: this.buildUniforms(descriptor, textures),
        transparent: descriptor.transparent,
        depthWrite: descriptor.depthWrite,
        side: descriptor.doubleSided ? DoubleSide : FrontSide,
      });
      material.index0AttributeName = "a_position";
      if (descriptor.blending === "additive") {
        // Match the Unity brush shaders' "Blend One One": the fragment stage
        // already premultiplies by the brush mask.
        material.blending = CustomBlending;
        material.blendEquation = AddEquation;
        material.blendSrc = OneFactor;
        material.blendDst = OneFactor;
      } else if (descriptor.blending === "alpha") {
        material.blending = NormalBlending;
      }
      targetMaterials.set(entry.guid, material);
      if (targetMaterials === this.materials) {
        for (const listener of this.materialLoadedListeners) {
          try {
            listener(entry.guid, material);
          } catch (error) {
            console.warn(
              `[BrushMaterialUpgrade] listener failed for ${entry.guid}:`,
              error,
            );
          }
        }
      }
      openBrushShaderCompatibility.record({
        guid: entry.guid,
        name: entry.name,
        context: "asset-load",
        status: "ready",
      });
      return material;
    } catch (error) {
      console.warn(
        `OpenBrush shader material for ${descriptor.name} (${entry.guid}) failed to load; using fallback material.`,
        error,
      );
      openBrushShaderCompatibility.record({
        guid: entry.guid,
        name: entry.name,
        context: "asset-load",
        status: "load-failed",
        message: toErrorMessage(error),
      });
      return undefined;
    }
  }

  private async createAuthoritativeMaterial(
    entry: BrushInventoryEntry,
    targetMaterials: Map<string, ShaderMaterial>,
  ): Promise<ShaderMaterial | undefined> {
    try {
      let material: ShaderMaterial | undefined;
      await this.tiltShaderLoader.load(
        entry.name,
        (loaded: ShaderMaterial) => {
          material = loaded;
        },
        undefined,
        undefined,
      );
      if (!material) {
        throw new Error(`three-icosa has no material binding for ${entry.name}`);
      }
      for (const [name, holder] of Object.entries(this.frameUniforms)) {
        material.uniforms[name] = holder;
      }
      targetMaterials.set(entry.guid, material);
      if (targetMaterials === this.materials) {
        for (const listener of this.materialLoadedListeners) {
          listener(entry.guid, material);
        }
      }
      openBrushShaderCompatibility.record({
        guid: entry.guid,
        name: entry.name,
        context: "asset-load",
        status: "ready",
      });
      return material;
    } catch (error) {
      console.warn(
        `Authoritative OpenBrush material for ${entry.name} (${entry.guid}) failed to load; using fallback material.`,
        error,
      );
      openBrushShaderCompatibility.record({
        guid: entry.guid,
        name: entry.name,
        context: "asset-load",
        status: "load-failed",
        message: toErrorMessage(error),
      });
      return undefined;
    }
  }

  private buildUniforms(
    descriptor: BrushShaderMaterialDescriptor,
    textures: Map<string, Texture>,
  ): Record<string, UniformHolder> {
    const uniforms: Record<string, UniformHolder> = {};
    for (const [name, value] of Object.entries(descriptor.uniforms)) {
      uniforms[name] =
        typeof value === "number"
          ? { value }
          : { value: new Vector4(value[0], value[1], value[2], value[3]) };
    }
    for (const [name, texture] of textures) {
      uniforms[name] = { value: texture };
      const texelSize = resolveLoadedTextureTexelSize(texture.image);
      if (texelSize) {
        uniforms[`${name}_TexelSize`] = { value: new Vector4(...texelSize) };
      }
    }
    // Shared holders are assigned by reference so a single updateFrame()
    // reaches every material; unused uniforms are ignored at upload time.
    for (const [name, holder] of Object.entries(this.frameUniforms)) {
      uniforms[name] = holder;
    }
    return uniforms;
  }
}

interface WebGLProgramDiagnostics {
  runnable: boolean;
  programLog: string;
  vertexShader?: { log?: string };
  fragmentShader?: { log?: string };
}

interface InspectableWebGLProgram {
  program?: WebGLProgram;
  diagnostics?: WebGLProgramDiagnostics;
  getAttributes?: () => unknown;
}

function getMaterialCompileFailure(
  renderer: WebGLRenderer,
  material: ShaderMaterial,
): string | undefined {
  const properties = renderer.properties.get(material) as {
    programs?: Map<unknown, InspectableWebGLProgram>;
  };
  const programs = properties.programs;
  if (!programs || programs.size === 0) {
    return "No WebGL program was produced during shader warmup.";
  }
  const gl = renderer.getContext();
  for (const program of programs.values()) {
    program.getAttributes?.();
    const linked = program.program
      ? Boolean(gl.getProgramParameter(program.program, gl.LINK_STATUS))
      : program.diagnostics?.runnable !== false;
    if (!linked || program.diagnostics?.runnable === false) {
      const diagnostics = program.diagnostics;
      return [
        diagnostics?.programLog,
        diagnostics?.vertexShader?.log,
        diagnostics?.fragmentShader?.log,
      ]
        .filter(Boolean)
        .join("\n") || "WebGL shader program failed to link.";
    }
  }
  return undefined;
}

function resolveRendererName(renderer: WebGLRenderer): string {
  try {
    const gl = renderer.getContext();
    return String(gl.getParameter(gl.RENDERER) ?? "unknown");
  } catch {
    return "unknown";
  }
}

function toErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 4000);
}

async function fetchShaderSource(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch shader ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

async function loadBrushTextures(
  descriptor: BrushShaderMaterialDescriptor,
): Promise<Map<string, Texture>> {
  const loaded = await Promise.all(
    descriptor.textures.map(async ({ uniform, url, importer }) => {
      const texture = await AssetManager.loadTexture(url);
      texture.flipY = false;
      texture.colorSpace = importer?.sRGB ? SRGBColorSpace : NoColorSpace;
      texture.wrapS = resolveBrushTextureWrapping(importer?.wrapU);
      texture.wrapT = resolveBrushTextureWrapping(importer?.wrapV);
      texture.generateMipmaps = importer?.mipmaps ?? true;
      texture.magFilter = importer?.filter === "point" ? NearestFilter : LinearFilter;
      texture.minFilter = resolveBrushTextureMinFilter(
        importer?.filter,
        texture.generateMipmaps,
      );
      texture.anisotropy = importer?.anisotropy ?? 1;
      texture.needsUpdate = true;
      return [uniform, texture] as const;
    }),
  );
  return new Map(loaded);
}

export function resolveBrushTextureWrapping(
  mode: "repeat" | "clamp" | "mirror" | "mirror-once" | undefined,
) {
  switch (mode) {
    case "clamp":
      return ClampToEdgeWrapping;
    case "mirror":
    case "mirror-once":
      // WebGL has no mirror-once sampler mode; mirrored repeat preserves the
      // mirrored edge behavior without silently falling back to repeat.
      return MirroredRepeatWrapping;
    default:
      return RepeatWrapping;
  }
}

export function resolveBrushTextureMinFilter(
  filter: "point" | "bilinear" | "trilinear" | undefined,
  mipmaps: boolean,
) {
  if (!mipmaps) {
    return filter === "point" ? NearestFilter : LinearFilter;
  }
  switch (filter) {
    case "point":
      return NearestMipmapNearestFilter;
    case "trilinear":
      return LinearMipmapLinearFilter;
    default:
      return LinearMipmapNearestFilter;
  }
}

/**
 * Registers the GLSL attribute names used by the Open Brush shaders as
 * aliases of the standard three.js attributes. The same BufferAttribute
 * object is registered under both names, so there is a single GPU buffer;
 * a_position is declared vec4 in GLSL against an itemSize-3 buffer, which is
 * legal GL (w defaults to 1).
 */
export function applyBrushShaderAttributeAliases(geometry: BufferGeometry): void {
  const aliases: ReadonlyArray<[string, string]> = [
    ["position", "a_position"],
    ["normal", "a_normal"],
    ["tangent", "a_tangent"],
    ["color", "a_color"],
    ["uv", "a_texcoord0"],
    ["uv1", "a_texcoord1"],
  ];
  for (const [standardName, glslName] of aliases) {
    const attribute = geometry.getAttribute(standardName);
    if (attribute && geometry.getAttribute(glslName) !== attribute) {
      geometry.setAttribute(glslName, attribute);
    }
  }
}

function createWarmupGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute("tangent", new BufferAttribute(new Float32Array(12), 4));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(12), 4));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(6), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  applyBrushShaderAttributeAliases(geometry);
  return geometry;
}

/** Shared library instance used by the stroke rendering systems. */
export const openBrushShaderLibrary = new BrushShaderLibrary();
