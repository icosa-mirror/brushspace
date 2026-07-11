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

import type { BrushInventoryEntry } from "./brush-inventory.js";
import {
  openBrushShaderCompatibility,
  type BrushShaderCompatibilityContext,
} from "./brush-shader-compatibility.js";
import {
  createBrushShaderMaterialDescriptor,
  prepareBrushShaderSource,
  OPENBRUSH_AMBIENT_LIGHT_COLOR,
  OPENBRUSH_FOG_COLOR,
  OPENBRUSH_SCENE_LIGHT_0_COLOR,
  OPENBRUSH_SCENE_LIGHT_0_MATRIX,
  OPENBRUSH_SCENE_LIGHT_1_COLOR,
  OPENBRUSH_SCENE_LIGHT_1_MATRIX,
  type BrushShaderMaterialDescriptor,
} from "./brush-shader-materials.js";

interface UniformHolder {
  value: unknown;
}

/**
 * Loads and caches one ShaderMaterial per brush GUID from the extracted
 * Open Brush GLSL exports. Materials are shared across strokes; per-frame
 * state (time, camera-space light matrices) lives in uniform holder objects
 * shared by reference across all materials, so one update reaches everything.
 */
export class BrushShaderLibrary {
  private readonly materials = new Map<string, ShaderMaterial>();
  private readonly pending = new Map<string, Promise<ShaderMaterial | undefined>>();
  private readonly materialLoadedListeners = new Set<
    (guid: string, material: ShaderMaterial) => void
  >();
  private readonly lightWorld0 = new Matrix4().fromArray(OPENBRUSH_SCENE_LIGHT_0_MATRIX);
  private readonly lightWorld1 = new Matrix4().fromArray(OPENBRUSH_SCENE_LIGHT_1_MATRIX);
  private readonly viewMatrix = new Matrix4();

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
    const cached = this.materials.get(entry.guid);
    if (cached) {
      return cached;
    }
    let promise = this.pending.get(entry.guid);
    if (!promise) {
      promise = this.createMaterial(entry, options);
      this.pending.set(entry.guid, promise);
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
  ): Promise<ShaderMaterial | undefined> {
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
        vertexShader: prepareBrushShaderSource(vertexShader),
        fragmentShader: prepareBrushShaderSource(fragmentShader),
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
      this.materials.set(entry.guid, material);
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
