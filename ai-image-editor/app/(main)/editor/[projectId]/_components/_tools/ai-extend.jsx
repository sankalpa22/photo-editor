"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCanvas } from "@/context/context";
import { FabricImage } from "fabric";
import { useConvexMutation } from "@/hooks/use-convex-query";
import { api } from "@/convex/_generated/api";

const DIRECTIONS = [
  { key: "top", label: "Top", icon: ArrowUp },
  { key: "bottom", label: "Bottom", icon: ArrowDown },
  { key: "left", label: "Left", icon: ArrowLeft },
  { key: "right", label: "Right", icon: ArrowRight },
];

const FOCUS_MAP = {
  left: "fo-right",
  right: "fo-left",
  top: "fo-bottom",
  bottom: "fo-top",
};

export function AIExtenderControls({ project }) {
  const { canvasEditor, setProcessingMessage } = useCanvas();
  const [selectedDirection, setSelectedDirection] = useState(null);
  const [extensionAmount, setExtensionAmount] = useState(200);
  const { mutate: updateProject } = useConvexMutation(
    api.projects.updateProject
  );

  const getMainImage = () =>
    canvasEditor?.getObjects().find((obj) => obj.type === "image") || null;

  const getImageSrc = (image) =>
    image?.getSrc?.() || image?._element?.src || image?.src;

  const ensureImageKitUrl = async (imageUrl) => {
    if (imageUrl.includes("imagekit.io")) return imageUrl;

    try {
      setProcessingMessage("Uploading image to AI server...");
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], "image.png", { type: "image/png" });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", "ai-extend-upload.png");

      const uploadResponse = await fetch("/api/imagekit/upload", {
        method: "POST",
        body: formData,
      });

      const data = await uploadResponse.json();
      if (!data.success) throw new Error(data.error || "Upload failed");

      return data.url;
    } catch (error) {
      console.error("Upload error:", error);
      throw new Error("Failed to upload image for AI processing");
    }
  };


  const calculateDimensions = () => {
    if (!project || !selectedDirection) return { width: 0, height: 0 };

    const currentWidth = project.width;
    const currentHeight = project.height;

    const isHorizontal = ["left", "right"].includes(selectedDirection);
    const isVertical = ["top", "bottom"].includes(selectedDirection);

    return {
      width: Math.round(currentWidth + (isHorizontal ? extensionAmount : 0)),
      height: Math.round(currentHeight + (isVertical ? extensionAmount : 0)),
    };
  };

  const buildExtensionUrl = (imageUrl) => {
    if (!imageUrl || !selectedDirection) return imageUrl;

    const baseUrl = imageUrl.split("?")[0];
    const { width, height } = calculateDimensions();

    const transformations = [
      "bg-genfill",
      `w-${width}`,
      `h-${height}`,
      "cm-pad_resize",
    ];

    // Add focus positioning
    const focus = FOCUS_MAP[selectedDirection];
    if (focus) transformations.push(focus);

    return `${baseUrl}?tr=${transformations.join(",")}`;
  };

  const selectDirection = (direction) => {
    // Toggle selection - if same direction is clicked, deselect it
    setSelectedDirection((prev) => (prev === direction ? null : direction));
  };

  const applyExtension = async () => {
    if (!canvasEditor || !selectedDirection) return;

    setProcessingMessage("Extending combined image with AI...");

    try {
      // Capture the combined canvas. JPEG uses white for transparent pixels,
      // avoiding the dark/black background issue with gen-fill.
      const dataUrl = canvasEditor.toDataURL({ format: "jpeg", quality: 1, multiplier: 1 });

      setProcessingMessage("Uploading canvas to AI Server...");
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], "ai-extend-combined.jpg", { type: "image/jpeg" });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", `ext-combined-${Date.now()}.jpg`);

      const uploadResponse = await fetch("/api/imagekit/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadResponse.json();
      if (!uploadData.success) throw new Error(uploadData.error || "Upload failed");

      const uploadedUrl = uploadData.url;

      setProcessingMessage("Applying AI Extension...");
      const extendedUrl = buildExtensionUrl(uploadedUrl);

      // Test URL accessibility before loading with polling
      let isReady = false;
      for (let i = 0; i < 25; i++) {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        if (i === 5) {
          setProcessingMessage("AI extension taking longer, please wait...");
        } else if (i === 15) {
          setProcessingMessage("Still extending your image...");
        }
        
        try {
          const testResponse = await fetch(extendedUrl, { method: 'HEAD' });
          if (testResponse.ok) {
            isReady = true;
            break;
          }
        } catch (fetchError) {
          console.warn("URL test failed, retrying...", fetchError);
        }
      }

      if (!isReady) {
        throw new Error("AI extension failed or timed out. Please try again.");
      }

      const loadImagePromise = FabricImage.fromURL(extendedUrl, {
        crossOrigin: "anonymous",
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Image loading timed out")), 40000);
      });
      
      const extendedImage = await Promise.race([loadImagePromise, timeoutPromise]);

      // Clear the canvas and backgrounds to place the new merged flat image
      canvasEditor.clear();
      canvasEditor.backgroundColor = null;
      canvasEditor.backgroundImage = null;

      const { width: newWidth, height: newHeight } = calculateDimensions();

      // Resize the canvas container to match the extended bounds
      canvasEditor.setWidth(newWidth);
      canvasEditor.setHeight(newHeight);

      extendedImage.set({
        left: newWidth / 2,
        top: newHeight / 2,
        originX: "center",
        originY: "center",
        selectable: true,
        evented: true,
      });

      canvasEditor.add(extendedImage);
      canvasEditor.setActiveObject(extendedImage);

      // Adjust viewport scale like in resize tool
      const container = canvasEditor.getElement().parentNode;
      if (container) {
        const containerWidth = container.clientWidth - 40;
        const containerHeight = container.clientHeight - 40;
        const scaleX = containerWidth / newWidth;
        const scaleY = containerHeight / newHeight;
        const viewportScale = Math.min(scaleX, scaleY, 1);

        canvasEditor.setDimensions(
          {
            width: newWidth * viewportScale,
            height: newHeight * viewportScale,
          },
          { backstoreOnly: false }
        );
        canvasEditor.setZoom(viewportScale);
      }

      canvasEditor.calcOffset();
      canvasEditor.requestRenderAll();

      // Save to database
      await updateProject({
        projectId: project._id,
        currentImageUrl: extendedUrl,
        canvasState: canvasEditor.toJSON(),
        width: newWidth,
        height: newHeight,
      });

      setSelectedDirection(null);
    } catch (error) {
      console.error("Error applying extension:", error);
      alert("Failed to extend image. Please try again.");
    } finally {
      setProcessingMessage(null);
    }
  };

  // Early returns for error states
  if (!canvasEditor) {
    return <div className="p-4 text-white/70 text-sm">Canvas not ready</div>;
  }

  const mainImage = getMainImage();
  if (!mainImage) {
    return (
      <div className="p-4 text-white/70 text-sm">Please add an image first</div>
    );
  }



  const { width: newWidth, height: newHeight } = calculateDimensions();
  const currentImage = getMainImage();

  return (
    <div className="space-y-6">
      {/* Direction Selection */}
      <div>
        <h3 className="text-sm font-medium text-white mb-3">
          Select Extension Direction
        </h3>
        <p className="text-xs text-white/70 mb-3">
          Choose one direction to extend your image
        </p>
        <div className="grid grid-cols-2 gap-3">
          {DIRECTIONS.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              onClick={() => selectDirection(key)}
              variant={selectedDirection === key ? "default" : "outline"}
              className={`flex items-center gap-2 ${selectedDirection === key ? "bg-cyan-500 hover:bg-cyan-600" : ""
                }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Extension Amount */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm text-white">Extension Amount</label>
          <span className="text-xs text-white/70">{extensionAmount}px</span>
        </div>
        <Slider
          value={[extensionAmount]}
          onValueChange={([value]) => setExtensionAmount(value)}
          min={50}
          max={500}
          step={25}
          className="w-full"
          disabled={!selectedDirection}
        />
      </div>

      {/* Dimensions Preview */}
      {selectedDirection && (
        <div className="bg-slate-700/30 rounded-lg p-3">
          <h4 className="text-sm font-medium text-white mb-2">
            Extension Preview
          </h4>
          <div className="text-xs text-white/70 space-y-1">
            <div>
              Current:{" "}
              {Math.round(currentImage.width * (currentImage.scaleX || 1))} ×{" "}
              {Math.round(currentImage.height * (currentImage.scaleY || 1))}px
            </div>
            <div className="text-cyan-400">
              Extended: {newWidth} × {newHeight}px
            </div>
            <div className="text-white/50">
              Canvas: {project.width} × {project.height}px (unchanged)
            </div>
            <div className="text-cyan-300">
              Direction:{" "}
              {DIRECTIONS.find((d) => d.key === selectedDirection)?.label}
            </div>
          </div>
        </div>
      )}

      {/* Apply Button */}
      <Button
        onClick={applyExtension}
        disabled={!selectedDirection}
        className="w-full"
        variant="primary"
      >
        <Wand2 className="h-4 w-4 mr-2" />
        Apply AI Extension
      </Button>

      {/* Instructions */}
      <div className="bg-slate-700/30 rounded-lg p-3">
        <p className="text-xs text-white/70">
          <strong>How it works:</strong> Select one direction → Set amount →
          Apply extension. AI will intelligently fill the new area in that
          direction.
        </p>
      </div>
    </div>
  );
}
