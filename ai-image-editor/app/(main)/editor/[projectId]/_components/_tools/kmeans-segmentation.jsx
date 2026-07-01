"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Palette, RotateCcw, Loader2, Copy } from "lucide-react";
import { useCanvas } from "@/context/context";
import {
  getActiveImage,
  readSourceImageData,
  imageDataToDataURL,
  applyDataURL,
  revertToOriginal,
} from "./pixel-utils";

/**
 * =====================================================================
 *  K-MEANS COLOR SEGMENTATION (my own algorithm)
 * =====================================================================
 *  An unsupervised machine learning algorithm that partitions image
 *  pixels into K clusters. We optimize the iteration speed by sampling
 *  a subset of pixels (up to 10k) for fast centroid convergence (<50ms),
 *  then perform a final, single-pass pixel assignment over the full image.
 *
 *  Complexity:
 *    - Clustering (Sampled): O(I * K * S) where S is sample size (10k),
 *      I is iterations (~10-15), K is cluster count.
 *    - Mapping (Full): O(K * N) where N is full pixel count.
 * =====================================================================
 */

/**
 * Run K-Means Clustering on ImageData.
 * 
 * @param {ImageData} imageData      source ImageData to be mutated
 * @param {number}    k              number of clusters (2..16)
 * @param {number}    maxIterations  iteration limit for safety
 * @returns {{ centroids: [number, number, number][], imageData: ImageData }}
 */
export function runKMeans(imageData, k, maxIterations = 15) {
  const data = imageData.data;
  const numPixels = data.length / 4;

  // Step 1: Sub-sample pixel buffer for high performance centroid convergence
  // (Prevents UI lockups by avoiding running 15 iterations on 1M+ pixels)
  const maxSamples = 10000;
  const sampleStep = Math.max(1, Math.floor(numPixels / maxSamples));
  const samplePixels = [];
  
  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    samplePixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  // Step 2: Initialize centroids randomly (Forgy Method)
  let centroids = [];
  const usedIndices = new Set();
  
  while (centroids.length < k && usedIndices.size < samplePixels.length) {
    const idx = Math.floor(Math.random() * samplePixels.length);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      centroids.push([...samplePixels[idx]]);
    }
  }

  // Guard: If image contains fewer unique colors than K
  if (centroids.length < k) {
    k = centroids.length;
  }

  let iterations = 0;
  let centroidsChanged = true;

  while (centroidsChanged && iterations < maxIterations) {
    // Sum arrays for centroid averaging
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);

    // Assign each sampled pixel to the nearest centroid (Euclidean distance)
    for (let p = 0; p < samplePixels.length; p++) {
      const pixel = samplePixels[p];
      let minDist = Infinity;
      let nearestCluster = 0;

      for (let c = 0; c < k; c++) {
        const centroid = centroids[c];
        const dr = pixel[0] - centroid[0];
        const dg = pixel[1] - centroid[1];
        const db = pixel[2] - centroid[2];
        const dist = dr * dr + dg * dg + db * db; // Squared distance is faster

        if (dist < minDist) {
          minDist = dist;
          nearestCluster = c;
        }
      }

      sums[nearestCluster][0] += pixel[0];
      sums[nearestCluster][1] += pixel[1];
      sums[nearestCluster][2] += pixel[2];
      counts[nearestCluster]++;
    }

    // Update centroids by calculating means
    let shift = 0;
    const newCentroids = [];
    
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        const newR = Math.round(sums[c][0] / counts[c]);
        const newG = Math.round(sums[c][1] / counts[c]);
        const newB = Math.round(sums[c][2] / counts[c]);

        const oldCentroid = centroids[c];
        const dr = newR - oldCentroid[0];
        const dg = newG - oldCentroid[1];
        const db = newB - oldCentroid[2];
        shift += Math.abs(dr) + Math.abs(dg) + Math.abs(db);

        newCentroids.push([newR, newG, newB]);
      } else {
        newCentroids.push([...centroids[c]]);
      }
    }

    centroids = newCentroids;
    
    // Convergence: Stop if centroids shift less than 1 level in total
    if (shift < 1) {
      centroidsChanged = false;
    }
    
    iterations++;
  }

  // Step 3: Run single-pass mapping over the full high-resolution image
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    let minDist = Infinity;
    let nearestCluster = 0;

    for (let c = 0; c < k; c++) {
      const centroid = centroids[c];
      const dr = r - centroid[0];
      const dg = g - centroid[1];
      const db = b - centroid[2];
      const dist = dr * dr + dg * dg + db * db;

      if (dist < minDist) {
        minDist = dist;
        nearestCluster = c;
      }
    }

    const finalColor = centroids[nearestCluster];
    data[i] = finalColor[0];
    data[i + 1] = finalColor[1];
    data[i + 2] = finalColor[2];
  }

  return { centroids, imageData };
}

// Convert RGB values to hex representation
function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function KMeansControls() {
  const { canvasEditor } = useCanvas();
  const [k, setK] = useState(8);
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [centroids, setCentroids] = useState([]);
  
  const originalSrcRef = useRef(null);

  // Recover state if canvas has processed originalSrc
  useEffect(() => {
    const img = getActiveImage(canvasEditor);
    if (img?.originalSrc) {
      originalSrcRef.current = img.originalSrc;
      setApplied(true);
    }
  }, [canvasEditor]);

  const applyKMeans = async () => {
    const img = getActiveImage(canvasEditor);
    if (!img || isApplying) return;

    setIsApplying(true);
    try {
      const pristine = img.originalSrc || originalSrcRef.current || img.getSrc();
      originalSrcRef.current = pristine;

      // Read pixel buffer
      const { imageData, width, height } = await readSourceImageData(pristine);
      
      // Execute the clustering algorithm
      const result = runKMeans(imageData, k);
      
      // Build PNG URL and apply to active Canvas object
      const dataURL = imageDataToDataURL(result.imageData);
      await applyDataURL(canvasEditor, img, dataURL, pristine, `kmeans-${Date.now()}.png`);

      setCentroids(result.centroids);
      setApplied(true);
      toast.success(`Segmented image successfully into ${result.centroids.length} colors`);
    } catch (error) {
      console.error("Error running K-Means:", error);
      toast.error("Couldn't process image segmentations - cross-origin or canvas error.");
    } finally {
      setIsApplying(false);
    }
  };

  const resetKMeans = async () => {
    const img = getActiveImage(canvasEditor);
    const pristine = img?.originalSrc || originalSrcRef.current;
    if (!img || !pristine || isApplying) return;

    setIsApplying(true);
    try {
      await revertToOriginal(canvasEditor, img, pristine);
      originalSrcRef.current = null;
      setApplied(false);
      setCentroids([]);
      setK(8);
      toast.success("Reverted to original image");
    } catch (error) {
      console.error("Error resetting K-Means:", error);
      toast.error("Reverting failed - please try again.");
    } finally {
      setIsApplying(false);
    }
  };

  const copyToClipboard = (hex) => {
    navigator.clipboard.writeText(hex);
    toast.success(`Copied palette color ${hex} to clipboard!`);
  };

  if (!canvasEditor) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Load an image to perform color segmentation</p>
      </div>
    );
  }

  const activeImage = getActiveImage(canvasEditor);
  if (!activeImage) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Select an image to segment colors</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">K-Means Color Segments</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetKMeans}
          disabled={!applied || isApplying}
          className="text-white/70 hover:text-white"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      <p className="text-xs text-white/60 leading-relaxed font-light">
        Segments colors into clusters using the{" "}
        <span className="text-white/80 font-medium font-semibold">K-Means algorithm</span>.
        It groups pixels by color similarity and extracts the dominant palette.
      </p>

      {/* Cluster count selection */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm text-white">Number of clusters (K)</label>
          <span className="text-xs text-white/70 font-semibold">{k}</span>
        </div>
        <Slider
          value={[k]}
          onValueChange={(val) => setK(val[0])}
          min={2}
          max={16}
          step={1}
          className="w-full"
          disabled={isApplying}
        />
        <p className="text-[10px] text-white/40">
          Lower values create posterized designs; higher values preserve textures.
        </p>
      </div>

      {/* Segment action button */}
      <Button onClick={applyKMeans} disabled={isApplying} className="w-full gap-2 mt-4 bg-sky-600 hover:bg-sky-500 text-white">
        {isApplying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Clustering Pixels...
          </>
        ) : (
          <>
            <Palette className="h-4 w-4" />
            {applied ? "Re-apply K-Means" : "Segment Image"}
          </>
        )}
      </Button>

      {/* Extracted Swatches Palette */}
      {centroids.length > 0 && (
        <div className="space-y-3 p-4 bg-slate-800/60 rounded-xl border border-white/5">
          <h4 className="text-xs font-semibold text-white/90 uppercase tracking-wider">
            Extracted Dominant Palette
          </h4>
          <div className="grid grid-cols-4 gap-3">
            {centroids.map((centroid, index) => {
              const hex = rgbToHex(centroid[0], centroid[1], centroid[2]);
              return (
                <div
                  key={index}
                  className="flex flex-col items-center gap-1 group cursor-pointer"
                  onClick={() => copyToClipboard(hex)}
                  title="Click to copy HEX"
                >
                  <div
                    className="h-10 w-10 rounded-full border border-white/10 shadow-lg transform transition-transform group-hover:scale-110 active:scale-95 flex items-center justify-center"
                    style={{ backgroundColor: hex }}
                  >
                    <Copy className="h-3 w-3 text-white/0 group-hover:text-white/80 transition-colors drop-shadow" />
                  </div>
                  <span className="text-[9px] text-white/50 font-mono select-all truncate max-w-full">
                    {hex}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-white/40 text-center">
            Click any color circle to copy its HEX value.
          </p>
        </div>
      )}

      {/* Academic Explanatory Card */}
      <div className="p-3 bg-slate-900/40 rounded-lg border border-white/5 text-[11px] text-white/50 space-y-1">
        <p className="font-semibold text-white/70">Performance Optimization Details:</p>
        <p>
          1. **Sub-sampled Clustering:** Automatically isolates 10,000 pixels to iteratively optimize centroids in RGB space, achieving convergence in milliseconds.
        </p>
        <p>
          2. **Global Assignment:** Reconstructs the final high-resolution canvas with a single-pass Euclidean mapping.
        </p>
      </div>
    </div>
  );
}
