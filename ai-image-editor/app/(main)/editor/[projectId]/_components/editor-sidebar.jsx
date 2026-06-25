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
} from "lucide-react";
import { AdjustControls } from "./_tools/adjust";
import { BackgroundControls } from "./_tools/background-controls";
import { useCanvas } from "@/context/context";
import { TextControls } from "./_tools/text";
import { AIExtenderControls } from "./_tools/ai-extend";
import { ResizeControls } from "./_tools/resize";
import { AIEdit } from "./_tools/ai-edit";
import { CropContent } from "./_tools/crop";

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
};

export function EditorSidebar({ project }) {
  const { activeTool } = useCanvas();

  const toolConfig = TOOL_CONFIGS[activeTool];

  if (!toolConfig) {
    return null;
  }

  const Icon = toolConfig.icon;

  return (
    <div className="min-w-96 bg-sidebar border-r border-white/5 flex flex-col shadow-2xl">
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
    case "background":
      return <BackgroundControls project={project} />;
    case "ai_extender":
      return <AIExtenderControls project={project} />;
    case "text":
      return <TextControls />;
    case "ai_edit":
      return <AIEdit project={project} />;
    default:
      return <div className="text-white">Select a tool to get started</div>;
  }
}
