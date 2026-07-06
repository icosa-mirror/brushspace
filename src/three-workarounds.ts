import { ClampToEdgeWrapping, Texture } from "@iwsdk/core";

// super-three's multiview render target allocates its color/depth textures as
// TEXTURE_2D_ARRAY and sets TEXTURE_WRAP_R from texture.wrapR — which the base
// Texture class never defines, so every multiview target init logs
// "WebGL: INVALID_ENUM: texParameter: invalid parameter". Give the base class
// the GL default as a prototype fallback; subclasses that care (Data3DTexture,
// DataArrayTexture) set their own instance value.
const texturePrototype = Texture.prototype as { wrapR?: number };
if (texturePrototype.wrapR === undefined) {
  texturePrototype.wrapR = ClampToEdgeWrapping;
}
