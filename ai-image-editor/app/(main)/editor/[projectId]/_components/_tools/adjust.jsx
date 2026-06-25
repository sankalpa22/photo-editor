"use client";

import React, { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  RotateCcw,
} from "lucide-react";
import { filters } from "fabric";
import { useCanvas } from "@/context/context";


/**
 * BRIGHTNESS ENGINE
 */
class ImageBrightness extends filters.Brightness {
  static type = "ImageBrightness";
  get type() { return "ImageBrightness"; }
  useOptimized = true; // Set to false to use manual loop

  applyTo2d(options) {
    if (this.useOptimized) return super.applyTo2d(options);


    const data = options.imageData.data;
    const adj = (this.brightness || 0) * 255;
    for (let i = 0; i < data.length; i += 4) {
      data[i] += adj;
      data[i + 1] += adj;
      data[i + 2] += adj;
    }
  }
}

/**
 * CONTRAST ENGINE
 */
class ImageContrast extends filters.Contrast {
  static type = "ImageContrast";
  get type() { return "ImageContrast"; }
  useOptimized = true;

  applyTo2d(options) {
    if (this.useOptimized) return super.applyTo2d(options);

    // Manual Algorithm Implementation
    const data = options.imageData.data;
    const c = this.contrast || 0;
    const factor = (259 * (c * 255 + 255)) / (255 * (259 - c * 255));
    for (let i = 0; i < data.length; i += 4) {
      data[i] = factor * (data[i] - 128) + 128;
      data[i + 1] = factor * (data[i + 1] - 128) + 128;
      data[i + 2] = factor * (data[i + 2] - 128) + 128;
    }
  }
}

/**
 * SATURATION ENGINE
 */
class ImageSaturation extends filters.Saturation {
  static type = "ImageSaturation";
  get type() { return "ImageSaturation"; }
  useOptimized = true;

  applyTo2d(options) {
    if (this.useOptimized) return super.applyTo2d(options);


    const data = options.imageData.data;
    const s = this.saturation || 0;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.2989 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] += (data[i] - gray) * s;
      data[i + 1] += (data[i + 1] - gray) * s;
      data[i + 2] += (data[i + 2] - gray) * s;
    }
  }
}

/**
 * VIBRANCE ENGINE
 */
class ImageVibrance extends filters.Vibrance {
  static type = "ImageVibrance";
  get type() { return "ImageVibrance"; }
  useOptimized = true;

  applyTo2d(options) {
    if (this.useOptimized) return super.applyTo2d(options);


    const v = this.vibrance || 0;
    const data = options.imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const amt = ((Math.abs(max - avg) * 2) / 255) * v;
      data[i] += (max - data[i]) * amt;
      data[i + 1] += (max - data[i + 1]) * amt;
      data[i + 2] += (max - data[i + 2]) * amt;
    }
  }
}

/**
 * BLUR ENGINE
 */
class ImageBlur extends filters.Blur {
  static type = "ImageBlur";
  get type() { return "ImageBlur"; }
  useOptimized = true;

  applyTo2d(options) {
    if (this.useOptimized) return super.applyTo2d(options);


    const { width, height, data } = options.imageData;
    const temp = new Uint8ClampedArray(data);
    const radius = Math.floor((this.blur || 0) * 5);
    if (radius < 1) return;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const idx = (ny * width + nx) * 4;
              r += temp[idx]; g += temp[idx + 1]; b += temp[idx + 2];
              count++;
            }
          }
        }
        const i = (y * width + x) * 4;
        data[i] = r / count; data[i + 1] = g / count; data[i + 2] = b / count;
      }
    }
  }
}

/**
 * HUE ROTATION ENGINE
 */
class ImageHueRotation extends filters.HueRotation {
  static type = "ImageHueRotation";
  get type() { return "ImageHueRotation"; }
  useOptimized = true;

  applyTo2d(options) {
    if (this.useOptimized) return super.applyTo2d(options);


    const data = options.imageData.data;
    const angle = this.rotation || 0;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      data[i] = (0.213 + cosA * 0.787 - sinA * 0.213) * r +
        (0.715 - cosA * 0.715 - sinA * 0.715) * g +
        (0.072 - cosA * 0.072 + sinA * 0.928) * b;
      data[i + 1] = (0.213 - cosA * 0.213 + sinA * 0.143) * r +
        (0.715 + cosA * 0.285 + sinA * 0.14) * g +
        (0.072 - cosA * 0.072 - sinA * 0.283) * b;
      data[i + 2] = (0.213 - cosA * 0.213 - sinA * 0.787) * r +
        (0.715 - cosA * 0.715 + sinA * 0.715) * g +
        (0.072 + cosA * 0.928 + sinA * 0.072) * b;
    }
  }
}


const FILTER_CONFIGS = [
  {
    key: "brightness",
    label: "Brightness",
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    filterClass: ImageBrightness,
    valueKey: "brightness",
    transform: (value) => value / 100,
  },
  {
    key: "contrast",
    label: "Contrast",
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    filterClass: ImageContrast,
    valueKey: "contrast",
    transform: (value) => value / 100,
  },
  {
    key: "saturation",
    label: "Saturation",
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    filterClass: ImageSaturation,
    valueKey: "saturation",
    transform: (value) => value / 100,
  },
  {
    key: "vibrance",
    label: "Vibrance",
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    filterClass: ImageVibrance,
    valueKey: "vibrance",
    transform: (value) => value / 100,
  },
  {
    key: "blur",
    label: "Blur",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 0,
    filterClass: ImageBlur,
    valueKey: "blur",
    transform: (value) => value / 100,
  },
  {
    key: "hue",
    label: "Hue",
    min: -180,
    max: 180,
    step: 1,
    defaultValue: 0,
    filterClass: ImageHueRotation,
    valueKey: "rotation",
    transform: (value) => value * (Math.PI / 180),
    suffix: "°",
  },
];


// Default values object
const DEFAULT_VALUES = FILTER_CONFIGS.reduce((acc, config) => {
  acc[config.key] = config.defaultValue;
  return acc;
}, {});

export function AdjustControls() {
  const [filterValues, setFilterValues] = useState(DEFAULT_VALUES);
  const [isApplying, setIsApplying] = useState(false);
  const { canvasEditor } = useCanvas();

  const getActiveImage = () => {
    if (!canvasEditor) return null;
    const activeObject = canvasEditor.getActiveObject();
    if (activeObject && activeObject.type === "image") return activeObject;
    const objects = canvasEditor.getObjects();
    return objects.find((obj) => obj.type === "image") || null;
  };

  const applyFilters = async (newValues) => {
    const imageObject = getActiveImage();
    if (!imageObject || isApplying) return;

    setIsApplying(true);

    try {
      const filtersToApply = [];

      FILTER_CONFIGS.forEach((config) => {
        const value = newValues[config.key];
        if (value !== config.defaultValue) {
          const transformedValue = config.transform(value);
          filtersToApply.push(
            new config.filterClass({
              [config.valueKey]: transformedValue,
            })
          );
        }
      });

      imageObject.filters = filtersToApply;
      imageObject.applyFilters();
      canvasEditor.requestRenderAll();
    } catch (error) {
      console.error("Error applying filters:", error);
    } finally {
      setIsApplying(false);
    }
  };

  const handleValueChange = (filterKey, value) => {
    const newValues = {
      ...filterValues,
      [filterKey]: Array.isArray(value) ? value[0] : value,
    };
    setFilterValues(newValues);
    applyFilters(newValues);
  };

  const resetFilters = () => {
    setFilterValues(DEFAULT_VALUES);
    applyFilters(DEFAULT_VALUES);
  };

  const extractFilterValues = (imageObject) => {
    if (!imageObject?.filters?.length) return DEFAULT_VALUES;

    const extractedValues = { ...DEFAULT_VALUES };

    imageObject.filters.forEach((filter) => {
      const config = FILTER_CONFIGS.find(
        (c) => c.filterClass.name === filter.constructor.name
      );
      if (config) {
        const filterValue = filter[config.valueKey];
        if (config.key === "hue") {
          extractedValues[config.key] = Math.round(
            filterValue * (180 / Math.PI)
          );
        } else {
          extractedValues[config.key] = Math.round(filterValue * 100);
        }
      }
    });

    return extractedValues;
  };

  useEffect(() => {
    const imageObject = getActiveImage();
    if (imageObject?.filters) {
      const existingValues = extractFilterValues(imageObject);
      setFilterValues(existingValues);
    }
  }, [canvasEditor]);

  if (!canvasEditor) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">
          Load an image to start adjusting
        </p>
      </div>
    );
  }

  const activeImage = getActiveImage();
  if (!activeImage) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">
          Select an image to adjust filters
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Reset Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-white">Image Adjustments</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="text-white/70 hover:text-white"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      {/* Filter Controls */}
      {FILTER_CONFIGS.map((config) => (
        <div key={config.key} className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-white">{config.label}</label>
            <span className="text-xs text-white/70">
              {filterValues[config.key]}
              {config.suffix || ""}
            </span>
          </div>
          <Slider
            value={[filterValues[config.key]]}
            onValueChange={(value) => handleValueChange(config.key, value)}
            min={config.min}
            max={config.max}
            step={config.step}
            className="w-full"
          />
        </div>
      ))}

      {/* Info */}
      <div className="mt-6 p-3 bg-slate-700/50 rounded-lg">
        <p className="text-xs text-white/70">
          Adjustments are applied in real-time. Use the Reset button to restore
          original values.
        </p>
      </div>

      {/* Processing Indicator - Fixed height to prevent shaking */}
      <div className="h-8 flex items-center justify-center">
        {isApplying && (
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400"></div>
            <span className="text-xs text-white/70">
              Applying filters...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
