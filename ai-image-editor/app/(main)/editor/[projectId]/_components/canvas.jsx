import { useCanvas } from "@/context/context";
import { api } from "@/convex/_generated/api";
import { useConvexMutation } from "@/hooks/use-convex-query";
import { Canvas, FabricImage } from "fabric";
import React, { useEffect, useRef, useState } from "react";

const WORKSPACE_SIDE_PADDING_RATIO = 0.12;
const WORKSPACE_CANVAS_STATE_PROPS = ["workspacePaddingApplied"];

if (Canvas && !Canvas.prototype.__workspacePaddingPatched) {
  const baseToObject = Canvas.prototype.toObject;
  Canvas.prototype.toObject = function (propertiesToInclude = []) {
    return baseToObject.call(this, [
      ...propertiesToInclude,
      ...WORKSPACE_CANVAS_STATE_PROPS,
    ]);
  };
  Canvas.prototype.__workspacePaddingPatched = true;
}

function getExpandedWorkspaceWidth(width) {
  return Math.round(width * (1 + WORKSPACE_SIDE_PADDING_RATIO * 2));
}

function hasFabricObjects(canvasState) {
  return Array.isArray(canvasState?.objects);
}

function shiftObjectHorizontally(object, offset) {
  if (!object || typeof object.left !== "number") return;
  object.set({ left: object.left + offset });
  object.setCoords?.();
}

function CanvasEditor({ project }) {
  const canvasRef = useRef();
  const containerRef = useRef();
  const {
    canvasEditor,
    setCanvasEditor,
    activeTool,
    onToolChange,
    setHasUnsavedChanges,
  } = useCanvas();
  const [isLoading, setIsLoading] = useState(true);

  const { mutate: updateProject } = useConvexMutation(
    api.projects.updateProject
  );

  const calculateViewportScale = (
    width = project?.width,
    height = project?.height
  ) => {
    if (!containerRef.current || !project) return 1;
    const container = containerRef.current;
    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;
    const scaleX = containerWidth / width;
    const scaleY = containerHeight / height;
    return Math.min(scaleX, scaleY, 1);
  };

  useEffect(() => {
    if (!canvasRef.current || !project || canvasEditor) return;
    let canvasInstance = null;

    const initializeCanvas = async () => {
      setIsLoading(true);

      const shouldExpandWorkspace =
        project.canvasState?.workspacePaddingApplied !== true;
      const workspaceWidth = shouldExpandWorkspace
        ? getExpandedWorkspaceWidth(project.width)
        : project.width;
      const workspaceHeight = project.height;
      const workspaceSideOffset = (workspaceWidth - project.width) / 2;
      const viewportScale = calculateViewportScale(
        workspaceWidth,
        workspaceHeight
      );
      const canvas = new Canvas(canvasRef.current, {
        width: workspaceWidth,
        height: workspaceHeight,
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
        controlsAboveOverlay: true,
        selection: true,
        hoverCursor: "move",
        moveCursor: "move",
        defaultCursor: "default",
        allowTouchScrolling: false,
        renderOnAddRemove: true,
        skipTargetFind: false,
      });
      canvasInstance = canvas;
      canvas.workspacePaddingApplied = true;

      // Sync both lower and upper canvas layers
      canvas.setDimensions(
        {
          width: workspaceWidth * viewportScale,
          height: workspaceHeight * viewportScale,
        },
        { backstoreOnly: false }
      );

      canvas.setZoom(viewportScale);

      canvas.setZoom(viewportScale);

      // Load image
      if (project.currentImageUrl || project.originalImageUrl) {
        try {
          const imageUrl = project.currentImageUrl || project.originalImageUrl;
          
          // Test URL accessibility first
          try {
            const testResponse = await fetch(imageUrl, { method: 'HEAD' });
            if (!testResponse.ok) {
              console.warn(`Image URL not accessible: ${testResponse.status}`, imageUrl);
              // Continue anyway, Fabric.js might handle it
            }
          } catch (fetchError) {
            console.warn("Could not test image URL accessibility:", fetchError);
          }

          const fabricImage = await FabricImage.fromURL(imageUrl, {
            crossOrigin: "anonymous",
          });

          const scale = Math.min(
            workspaceWidth / fabricImage.width,
            workspaceHeight / fabricImage.height,
            1
          );

          fabricImage.set({
            left: workspaceWidth / 2,
            top: workspaceHeight / 2,
            originX: "center",
            originY: "center",
            scaleX: scale,
            scaleY: scale,
            selectable: true,
            evented: true,
          });

          canvas.add(fabricImage);
          canvas.centerObject(fabricImage);
        } catch (error) {
          console.error("Error loading project image:", error);
          // Don't throw here, just log the error and continue without the image
        }
      }

      // Load saved canvas state
      if (hasFabricObjects(project.canvasState)) {
        try {
          await canvas.loadFromJSON(project.canvasState);
          canvas.workspacePaddingApplied = true;
          if (shouldExpandWorkspace) {
            canvas.getObjects().forEach((object) => {
              shiftObjectHorizontally(object, workspaceSideOffset);
            });
            shiftObjectHorizontally(canvas.backgroundImage, workspaceSideOffset);
            shiftObjectHorizontally(canvas.overlayImage, workspaceSideOffset);
          }
          canvas.requestRenderAll();
        } catch (error) {
          console.error("Error loading canvas state:", error);
        }
      }

      canvas.calcOffset();
      canvas.requestRenderAll();
      setCanvasEditor(canvas);

      setTimeout(() => {
        // workaround for initial resize issues
        window.dispatchEvent(new Event("resize"));
      }, 500);

      if (shouldExpandWorkspace) {
        try {
          await updateProject({
            projectId: project._id,
            width: workspaceWidth,
            height: workspaceHeight,
            canvasState: canvas.toJSON(),
          });
        } catch (error) {
          console.error("Error saving expanded workspace:", error);
        }
      }

      setIsLoading(false);
    };

    initializeCanvas();

    return () => {
      if (canvasInstance) {
        canvasInstance.dispose();
        setCanvasEditor(null);
      }
    };
  }, [project]);

  useEffect(() => {
    if (!canvasEditor) return;

    const markUnsaved = () => setHasUnsavedChanges?.(true);

    canvasEditor.on("object:modified", markUnsaved);
    canvasEditor.on("object:added", markUnsaved);
    canvasEditor.on("object:removed", markUnsaved);
    canvasEditor.on("path:created", markUnsaved);

    return () => {
      canvasEditor.off("object:modified", markUnsaved);
      canvasEditor.off("object:added", markUnsaved);
      canvasEditor.off("object:removed", markUnsaved);
      canvasEditor.off("path:created", markUnsaved);
    };
  }, [canvasEditor, setHasUnsavedChanges]);

  useEffect(() => {
    if (!canvasEditor) return;

    switch (activeTool) {
      case "crop":
        canvasEditor.defaultCursor = "crosshair";
        canvasEditor.hoverCursor = "crosshair";
        break;
      default:
        canvasEditor.defaultCursor = "default";
        canvasEditor.hoverCursor = "move";
    }
  }, [canvasEditor, activeTool]);

  useEffect(() => {
    if (!containerRef.current || !canvasEditor || !project) return;

    const resizeObserver = new ResizeObserver(() => {
      const newScale = calculateViewportScale();
      canvasEditor.setDimensions(
        {
          width: project.width * newScale,
          height: project.height * newScale,
        },
        { backstoreOnly: false }
      );
      canvasEditor.setZoom(newScale);
      canvasEditor.calcOffset();
      canvasEditor.requestRenderAll();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvasEditor, project]);

  // Handle automatic tab switching when text is selected
  useEffect(() => {
    if (!canvasEditor || !onToolChange) return;

    const handleSelection = (e) => {
      const selectedObject = e.selected?.[0];
      if (selectedObject && selectedObject.type === "i-text") {
        onToolChange("text");
      }
    };

    canvasEditor.on("selection:created", handleSelection);
    canvasEditor.on("selection:updated", handleSelection);

    return () => {
      canvasEditor.off("selection:created", handleSelection);
      canvasEditor.off("selection:updated", handleSelection);
    };
  }, [canvasEditor, onToolChange]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center bg-secondary w-full h-full overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(45deg, #64748b 25%, transparent 25%),
            linear-gradient(-45deg, #64748b 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #64748b 75%),
            linear-gradient(-45deg, transparent 75%, #64748b 75%)`,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        }}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            <p className="text-white/70 text-sm">Loading canvas...</p>
          </div>
        </div>
      )}

      <div className="px-5">
        <canvas id="canvas" className="border" ref={canvasRef} />
      </div>
    </div>
  );
}

export default CanvasEditor;
