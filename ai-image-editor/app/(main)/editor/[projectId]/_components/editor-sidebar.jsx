"use client";

import React from "react";
import {
  Crop,
  Expand,
  Sliders,
  Palette,
  Maximize2,
  Text,
  Eye,
  Wand2,
  Grid3x3,
  Contrast,
  Paintbrush,
  Droplet,
} from "lucide-react";
import { AdjustControls } from "./_tools/adjust";
import { AutoEnhanceControls } from "./_tools/auto-enhance";
import { SobelControls } from "./_tools/sobel-edge";
import { OtsuControls } from "./_tools/otsu-threshold";
import { BackgroundControls } from "./_tools/background-controls";
import { useCanvas } from "@/context/context";
import { TextControls } from "./_tools/text";
import { AIExtenderControls } from "./_tools/ai-extend";
import { ResizeControls } from "./_tools/resize";
import { AIEdit } from "./_tools/ai-edit";
import { CropContent } from "./_tools/crop";
import { KMeansControls } from "./_tools/kmeans-segmentation";

const TOOL_CONFIGS = {
  resize: {
    title: "Resize",
    icon: Expand,
    description: "Change project dimensions",
  },
  crop: {
    title: "Crop",
    icon: Crop,
    description: "Crop and trim your image",
  },
  adjust: {
    title: "Adjust",
    icon: Sliders,
    description: "Brightness, contrast, and more (Manual saving required)",
  },
  auto_enhance: {
    title: "Auto Enhance",
    icon: Wand2,
    description: "One-click contrast boost via histogram equalization",
  },
  edge_detection: {
    title: "Edge Detection",
    icon: Grid3x3,
    description: "Outline the image with the Sobel operator",
  },
  threshold: {
    title: "Threshold",
    icon: Contrast,
    description: "Black & white via Otsu's automatic threshold",
  },
  background: {
    title: "Background",
    icon: Palette,
    description: "Remove or change background",
  },
  ai_extender: {
    title: "AI Image Extender",
    icon: Maximize2,
    description: "Extend image boundaries with AI",
  },
  text: {
    title: "Add Text",
    icon: Text,
    description: "Customize in Various Fonts",
  },
  ai_edit: {
    title: "AI Editing",
    icon: Eye,
    description: "Enhance image quality with AI",
  },
  kmeans: {
    title: "K-Means Clusters",
    icon: Paintbrush,
    description: "Simplify and cluster colors in the image",
  },
};

export function EditorSidebar({ project }) {
  const { activeTool } = useCanvas();

  const toolConfig = TOOL_CONFIGS[activeTool];

  if (!toolConfig) {
    return null;
  }

  const Icon = toolConfig.icon;

  return (
    <div className="w-96 min-w-96 max-w-96 bg-sidebar border-r border-white/5 flex flex-col shadow-2xl overflow-hidden">
      {/* Sidebar Header */}
      <div className="p-6 border-b border-black/5 flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {toolConfig.title}
          </h2>
        </div>
        <p className="text-sm text-foreground/50">{toolConfig.description}</p>
      </div>

      {/* Sidebar Content */}
      <div className="flex-1 p-6 overflow-y-auto scrollbar-hide">
        {renderToolContent(activeTool, project)}
      </div>
    </div>
  );
}

function renderToolContent(activeTool, project) {
  switch (activeTool) {
    case "crop":
      return <CropContent />;
    case "resize":
      return <ResizeControls project={project} />;
    case "adjust":
      return <AdjustControls />;
    case "auto_enhance":
      return <AutoEnhanceControls />;
    case "edge_detection":
      return <SobelControls />;
    case "threshold":
      return <OtsuControls />;
    case "background":
      return <BackgroundControls project={project} />;
    case "ai_extender":
      return <AIExtenderControls project={project} />;
    case "text":
      return <TextControls />;
    case "ai_edit":
      return <AIEdit project={project} />;
    case "kmeans":
      return <KMeansControls />;
    default:
      return <div className="text-white">Select a tool to get started</div>;
  }
}
