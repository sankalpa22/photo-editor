"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FabricImage } from "fabric";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Wand2, RotateCcw, Loader2 } from "lucide-react";
import { useCanvas } from "@/context/context";
import { applyDataURL, revertToOriginal } from "./pixel-utils";

/**
 * =====================================================================
 *  AUTO-ENHANCE  —  HISTOGRAM EQUALIZATION (my own algorithm)
 * =====================================================================
 *  Unlike the "Adjust" tool (which configures Fabric's built-in,
 *  GPU-accelerated filters), this is a deterministic algorithm I wrote
 *  by hand. It reads the raw pixels with getImageData() and remaps them.
 *
 *  Pipeline:
 *    Read pixels -> Compute luminance histogram -> Build CDF
 *    -> Build a 256-entry lookup table -> Remap every pixel -> Write back
 *
 *  Complexity: O(N + 256) -> O(N) in the pixel count (N pixels).
 *  Space:      O(N) for the luminance buffer + O(256) for the tables.
 * =====================================================================
 */

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Step 1 — Compute a 256-bin luminance histogram.
 *
 * Luminance (perceived brightness) uses the Rec. 601 luma weights:
 *   Y = 0.299*R + 0.587*G + 0.114*B
 * We also keep each pixel's luminance so we don't recompute it later.
 *
 * @param {Uint8ClampedArray} data  RGBA pixel array (4 bytes per pixel)
 * @returns {{ histogram: number[], luminance: Uint8Array }}
 */
export function computeLuminanceHistogram(data) {
  const histogram = new Array(256).fill(0);
  const luminance = new Uint8Array(data.length / 4);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const y = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    );
    luminance[p] = y;
    histogram[y]++;
  }

  return { histogram, luminance };
}

/**
 * Step 2 + 3 — Build the cumulative distribution (CDF) and turn it into a
 * 256-entry transfer / lookup table.
 *
 * The CDF *is* the cumulative probability of brightness; using it as the
 * transfer function is exactly what flattens (equalizes) the histogram.
 *
 *   map[k] = round( (cdf[k] - cdfMin) / (N - cdfMin) * 255 )
 *
 * where cdfMin is the first non-zero CDF value and N is the pixel count.
 *
 * @param {number[]} histogram   256-bin luminance histogram
 * @param {number}   totalPixels N — total number of pixels
 * @returns {Uint8Array} 256-entry old-luminance -> new-luminance map
 */
export function buildEqualizationMap(histogram, totalPixels) {
  // Build the cumulative distribution function.
  const cdf = new Array(256);
  let cumulative = 0;
  for (let k = 0; k < 256; k++) {
    cumulative += histogram[k];
    cdf[k] = cumulative;
  }

  // First non-zero CDF value (the darkest brightness actually present).
  let cdfMin = 0;
  for (let k = 0; k < 256; k++) {
    if (cdf[k] !== 0) {
      cdfMin = cdf[k];
      break;
    }
  }

  const denominator = totalPixels - cdfMin || 1; // guard against /0
  const map = new Uint8Array(256);
  for (let k = 0; k < 256; k++) {
    map[k] = clamp(Math.round(((cdf[k] - cdfMin) / denominator) * 255));
  }

  return map;
}

/**
 * Step 4 + 5 — Equalize the image in place.
 *
 * For every pixel we look up its new luminance and scale R, G, B by the
 * ratio newY/oldY. Scaling by a ratio equalizes brightness while keeping
 * the original colour relationships, instead of equalizing each channel
 * independently (which would shift the colours).
 *
 * `strength` (0..1) blends between the original and the fully equalized
 * luminance so the effect can be dialled down.
 *
 * @param {ImageData} imageData  pixels to modify (mutated in place)
 * @param {number}    strength   0 = no change, 1 = full equalization
 * @returns {ImageData} the same imageData, for convenience
 */
export function histogramEqualize(imageData, strength = 1) {
  const data = imageData.data;
  const totalPixels = data.length / 4;

  const { histogram, luminance } = computeLuminanceHistogram(data);
  const map = buildEqualizationMap(histogram, totalPixels);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const oldY = luminance[p];
    const equalizedY = map[oldY];
    const newY = oldY + (equalizedY - oldY) * strength;

    if (oldY === 0) {
      // Pure black pixel: no colour ratio to preserve, lift to neutral grey.
      data[i] = data[i + 1] = data[i + 2] = clamp(newY);
    } else {
      const ratio = newY / oldY;
      data[i] = clamp(data[i] * ratio);
      data[i + 1] = clamp(data[i + 1] * ratio);
      data[i + 2] = clamp(data[i + 2] * ratio);
    }
    // alpha (data[i + 3]) is left untouched
  }

  return imageData;
}

/** Load a source URL into an HTMLImageElement (CORS-safe for pixel reads). */
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Persist the pristine source through canvas serialization.
 *
 * The editor saves/loads the canvas with `toJSON()` / `loadFromJSON()` (no
 * explicit property list). By default Fabric would drop our custom
 * `originalSrc`, so once a project is saved & reloaded the original pixels
 * would be gone and Reset couldn't revert. Teaching FabricImage's `toObject`
 * to always include `originalSrc` makes Reset survive a reload. Guarded so it
 * only patches once even if this module is imported repeatedly.
 */
if (FabricImage && !FabricImage.prototype.__autoEnhancePatched) {
  const baseToObject = FabricImage.prototype.toObject;
  FabricImage.prototype.toObject = function (propertiesToInclude = []) {
    return baseToObject.call(this, [...propertiesToInclude, "originalSrc"]);
  };
  FabricImage.prototype.__autoEnhancePatched = true;
}

export function AutoEnhanceControls() {
  const { canvasEditor } = useCanvas();
  const [strength, setStrength] = useState(100);
  const [isApplying, setIsApplying] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  // Remember the pristine source so re-applying / reset is idempotent.
  const originalSrcRef = useRef(null);

  const getActiveImage = () => {
    if (!canvasEditor) return null;
    const activeObject = canvasEditor.getActiveObject();
    if (activeObject && activeObject.type === "image") return activeObject;
    const objects = canvasEditor.getObjects();
    return objects.find((obj) => obj.type === "image") || null;
  };

  // If the image was already enhanced in a previous session, its pristine
  // source was persisted on the object — pick it back up so Reset works.
  useEffect(() => {
    const imageObject = getActiveImage();
    if (imageObject?.originalSrc) {
      originalSrcRef.current = imageObject.originalSrc;
      setEnhanced(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasEditor]);

  const applyEnhancement = async () => {
    const imageObject = getActiveImage();
    if (!imageObject || isApplying) return;

    setIsApplying(true);
    try {
      // Capture the pristine source once, so every run starts from the
      // original pixels (clicking again never double-equalizes). Prefer one
      // already saved on the object (survives reloads) before falling back to
      // the in-memory ref and finally the live source.
      const pristineSrc =
        imageObject.originalSrc ||
        originalSrcRef.current ||
        imageObject.getSrc();
      originalSrcRef.current = pristineSrc;

      const sourceEl = await loadImageElement(pristineSrc);
      const w = sourceEl.naturalWidth;
      const h = sourceEl.naturalHeight;

      // Read pixels into an offscreen canvas.
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(sourceEl, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);

      // ---- the algorithm ----
      histogramEqualize(imageData, strength / 100);

      // Write the remapped pixels back and swap the image source.
      ctx.putImageData(imageData, 0, 0);
      const dataURL = offscreen.toDataURL("image/png");

      // Upload the result to ImageKit and point the object at the hosted URL,
      // preserving placement and the pristine source. Uploading (rather than
      // baking a base64 data URL into the canvas) keeps the saved state under
      // Convex's 1 MiB limit.
      await applyDataURL(
        canvasEditor,
        imageObject,
        dataURL,
        pristineSrc,
        `enhance-${Date.now()}.png`
      );

      setEnhanced(true);
      toast.success("Auto enhance applied");
    } catch (error) {
      console.error("Error applying auto-enhance:", error);
      toast.error(
        "Couldn't enhance this image — it may be blocked by cross-origin security."
      );
    } finally {
      setIsApplying(false);
    }
  };

  const resetEnhancement = async () => {
    const imageObject = getActiveImage();
    const pristineSrc = imageObject?.originalSrc || originalSrcRef.current;
    if (!imageObject || !pristineSrc || isApplying) return;

    setIsApplying(true);
    try {
      await revertToOriginal(canvasEditor, imageObject, pristineSrc);

      originalSrcRef.current = null;
      setEnhanced(false);
      setStrength(100);
      toast.success("Reverted to original");
    } catch (error) {
      console.error("Error resetting auto-enhance:", error);
      toast.error("Couldn't revert the image — please try again.");
    } finally {
      setIsApplying(false);
    }
  };

  if (!canvasEditor) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Load an image to auto-enhance</p>
      </div>
    );
  }

  const activeImage = getActiveImage();
  if (!activeImage) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Select an image to enhance</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Reset */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-white">Auto Enhance</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetEnhancement}
          disabled={!enhanced || isApplying}
          className="text-white/70 hover:text-white"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      <p className="text-xs text-white/60 leading-relaxed">
        Automatically improves contrast using{" "}
        <span className="text-white/80 font-medium">histogram equalization</span>
        . It builds a luminance histogram, derives its CDF, and remaps every
        pixel — brightening dull images while preserving their colours.
      </p>

      {/* Strength */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm text-white">Strength</label>
          <span className="text-xs text-white/70">{strength}%</span>
        </div>
        <Slider
          value={[strength]}
          onValueChange={(value) => setStrength(value[0])}
          min={0}
          max={100}
          step={1}
          className="w-full"
          disabled={isApplying}
        />
      </div>

      {/* Apply */}
      <Button
        onClick={applyEnhancement}
        disabled={isApplying}
        className="w-full gap-2"
      >
        {isApplying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enhancing...
          </>
        ) : (
          <>
            <Wand2 className="h-4 w-4" />
            {enhanced ? "Re-apply Auto Enhance" : "Auto Enhance"}
          </>
        )}
      </Button>

      {/* Info */}
      <div className="mt-2 p-3 bg-slate-700/50 rounded-lg">
        <p className="text-xs text-white/70">
          Deterministic O(N + 256) algorithm — one pass to build the histogram,
          a constant-size lookup table, and one pass to remap pixels. Runs
          entirely in your browser.
        </p>
      </div>
    </div>
  );
}
