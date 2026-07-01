import { FabricImage } from "fabric";

/**
 * =====================================================================
 *  PIXEL-UTILS — shared plumbing for the hand-written pixel algorithms
 * =====================================================================
 *  The "auto enhance", "edge detection" and "threshold" tools all follow
 *  the same flow:
 *
 *    read the original pixels  ->  run a deterministic algorithm
 *    ->  write the result back  ->  swap the Fabric image source
 *
 *  This module holds the parts that are identical across all of them so
 *  each tool only has to provide its own algorithm + UI.
 * =====================================================================
 */

export const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Persist the pristine source through canvas serialization.
 *
 * The editor saves/loads the canvas with `toJSON()` / `loadFromJSON()` (no
 * explicit property list), so by default Fabric drops our custom
 * `originalSrc`. Teaching FabricImage's `toObject` to always include it means
 * Reset still works after a project is saved and reloaded. Guarded so it only
 * patches once, no matter how many tools import this module.
 */
if (FabricImage && !FabricImage.prototype.__autoEnhancePatched) {
  const baseToObject = FabricImage.prototype.toObject;
  FabricImage.prototype.toObject = function (propertiesToInclude = []) {
    return baseToObject.call(this, [...propertiesToInclude, "originalSrc"]);
  };
  FabricImage.prototype.__autoEnhancePatched = true;
}

/** The image to operate on: the active one, else the first image on canvas. */
export function getActiveImage(canvasEditor) {
  if (!canvasEditor) return null;
  const active = canvasEditor.getActiveObject();
  if (active && active.type === "image") return active;
  return canvasEditor.getObjects().find((obj) => obj.type === "image") || null;
}

/** Load a source URL into an HTMLImageElement (CORS-safe for pixel reads). */
export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Decode a source URL and read its raw RGBA pixels via an offscreen canvas. */
export async function readSourceImageData(src) {
  const el = await loadImageElement(src);
  const width = el.naturalWidth;
  const height = el.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(el, 0, 0);
  return { imageData: ctx.getImageData(0, 0, width, height), width, height };
}

/**
 * Per-pixel luminance (perceived brightness) using the Rec. 601 luma weights:
 *   Y = 0.299*R + 0.587*G + 0.114*B
 *
 * @param {Uint8ClampedArray} data  RGBA pixel array (4 bytes per pixel)
 * @returns {Uint8ClampedArray} one luminance byte per pixel
 */
export function toLuminance(data) {
  const luma = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    );
  }
  return luma;
}

/** 256-bin histogram of a luminance buffer. */
export function computeHistogram(luma) {
  const histogram = new Array(256).fill(0);
  for (let p = 0; p < luma.length; p++) histogram[luma[p]]++;
  return histogram;
}

/**
 * Turn a per-pixel scalar buffer (e.g. edge strength or luminance) into a
 * grayscale PNG data URL. `mapValue(v)` decides the final 0..255 gray for each
 * scalar — this is where thresholding / inverting happens.
 */
export function scalarToDataURL(scalar, width, height, mapValue) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  for (let p = 0, i = 0; p < scalar.length; p++, i += 4) {
    const v = mapValue(scalar[p]);
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Turn an ImageData object into a PNG data URL. */
export function imageDataToDataURL(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Snapshot placement so swapping the source never moves/resizes the object. */
function captureTransform(obj) {
  return {
    scaleX: obj.scaleX,
    scaleY: obj.scaleY,
    left: obj.left,
    top: obj.top,
    angle: obj.angle,
    flipX: obj.flipX,
    flipY: obj.flipY,
    originX: obj.originX,
    originY: obj.originY,
  };
}

/**
 * Upload a data URL to ImageKit and return the hosted https URL.
 *
 * This is the crucial step that keeps the saved project small. If we stored
 * the processed image as a base64 data URL inside the Fabric `src`, the whole
 * blob would be serialized into the canvas JSON and the autosave mutation
 * would blow past Convex's 1 MiB document limit. Uploading first means the
 * canvas only ever stores a short URL — exactly what the AI tools do.
 */
export async function uploadDataURL(dataURL, fileName) {
  const blob = await (await fetch(dataURL)).blob();
  const file = new File([blob], fileName, { type: "image/png" });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", fileName);

  const res = await fetch("/api/imagekit/upload", {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!data?.success || !data?.url) {
    throw new Error(data?.error || "Image upload failed");
  }
  return data.url;
}

/**
 * Persist a processed image: upload it to ImageKit, point the object at the
 * resulting URL (keeping placement), record the pristine `originalSrc`, and
 * notify the editor so autosave/undo runs — now with a tiny canvas state.
 */
export async function applyDataURL(
  canvasEditor,
  imageObject,
  dataURL,
  originalSrc,
  fileName = "edit.png"
) {
  const url = await uploadDataURL(dataURL, fileName);
  const transform = captureTransform(imageObject);
  await imageObject.setSrc(url, { crossOrigin: "anonymous" });
  imageObject.set(transform);
  if (originalSrc) imageObject.set("originalSrc", originalSrc);
  imageObject.setCoords();
  canvasEditor.requestRenderAll();
  canvasEditor.fire("object:modified", { target: imageObject });
  return url;
}

/** Restore an image to its pristine source and clear the "processed" marker. */
export async function revertToOriginal(canvasEditor, imageObject, originalSrc) {
  const transform = captureTransform(imageObject);
  await imageObject.setSrc(originalSrc, { crossOrigin: "anonymous" });
  imageObject.set(transform);
  imageObject.set("originalSrc", undefined);
  imageObject.setCoords();
  canvasEditor.requestRenderAll();
  canvasEditor.fire("object:modified", { target: imageObject });
}
