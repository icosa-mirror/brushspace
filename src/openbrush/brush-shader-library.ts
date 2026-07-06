import {
  AddEquation,
  AssetManager,
  BufferAttribute,
  BufferGeometry,
  Camera,
  CustomBlending,
  DoubleSide,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  NoColorSpace,
  NormalBlending,
  OneFactor,
  ShaderMaterial,
  RepeatWrapping,
  Scene,
  Texture,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "@iwsdk/core";

import type { BrushInventoryEntry } from "./brush-inventory.js";
import {
  createBrushShaderMaterialDescriptor,
  packBrushShaderTime,
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
    // Fog is disabled until stroke geometry moves to canvas units; the
    // shaders' density constants assume Open Brush world scale.
    u_fogDensity: { value: 0 },
  };

  get(guid: string): ShaderMaterial | undefined {
    return this.materials.get(guid);
  }

  async load(entry: BrushInventoryEntry): Promise<ShaderMaterial | undefined> {
    const cached = this.materials.get(entry.guid);
    if (cached) {
      return cached;
    }
    let promise = this.pending.get(entry.guid);
    if (!promise) {
      promise = this.createMaterial(entry);
      this.pending.set(entry.guid, promise);
    }
    return promise;
  }

  /** Advance shared per-frame uniforms. Call once per frame before rendering. */
  updateFrame(timeSeconds: number, camera: Camera): void {
    const [x, y, z, w] = packBrushShaderTime(timeSeconds);
    (this.frameUniforms.u_time.value as Vector4).set(x, y, z, w);
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
  async warmUp(renderer: WebGLRenderer, scene: Scene, camera: Camera): Promise<number> {
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
    } catch (error) {
      console.warn("OpenBrush shader warmup failed:", error);
    }
    for (const child of [...group.children]) {
      (child as Mesh).geometry.dispose();
      group.remove(child);
    }
    return this.materials.size;
  }

  private async createMaterial(
    entry: BrushInventoryEntry,
  ): Promise<ShaderMaterial | undefined> {
    const descriptor = createBrushShaderMaterialDescriptor(entry);
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
      return material;
    } catch (error) {
      console.warn(
        `OpenBrush shader material for ${descriptor.name} (${entry.guid}) failed to load; using fallback material.`,
        error,
      );
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
    descriptor.textures.map(async ({ uniform, url }) => {
      const texture = await AssetManager.loadTexture(url);
      // Match the glTF sampling convention the exported shaders and UVs were
      // authored for: no vertical flip, raw (non-sRGB-decoded) texels.
      texture.flipY = false;
      texture.colorSpace = NoColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.needsUpdate = true;
      return [uniform, texture] as const;
    }),
  );
  return new Map(loaded);
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
    ["color", "a_color"],
    ["uv", "a_texcoord0"],
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
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(12), 4));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(6), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  applyBrushShaderAttributeAliases(geometry);
  return geometry;
}

/** Shared library instance used by the stroke rendering systems. */
export const openBrushShaderLibrary = new BrushShaderLibrary();
