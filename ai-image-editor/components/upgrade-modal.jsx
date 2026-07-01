"use client";

import React from "react";
import { X, Crown, Zap, Check, Sparkles, Image, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

const PRO_FEATURES = [
  {
    icon: Image,
    title: "AI Background Removal",
    description: "Instantly remove or replace backgrounds with AI precision",
  },
  {
    icon: Wand2,
    title: "AI Image Extender",
    description: "Expand your image canvas with AI-generated content",
  },
  {
    icon: Sparkles,
    title: "AI Editing Suite",
    description: "Advanced AI-powered photo retouching and enhancement",
  },
  {
    icon: Zap,
    title: "Unlimited Exports",
    description: "Export as many images as you want, no monthly limits",
  },
];

export function UpgradeModal({ isOpen, onClose, restrictedTool, reason }) {
  const getToolName = (toolId) => {
    const toolNames = {
      background: "AI Background Tools",
      ai_extender: "AI Image Extender",
      ai_edit: "AI Editor",
      export: "Export",
    };
    return toolNames[toolId] || "Premium Feature";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-slate-900 border-white/10">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <Crown className="h-6 w-6 text-yellow-400" />
            </div>
            <DialogTitle className="text-2xl font-bold text-white">
              Upgrade to Pro
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Restriction Message */}
          {restrictedTool && (
            <Alert className="bg-amber-500/10 border-amber-500/30">
              <Zap className="h-4 w-4 text-amber-400" />
              <AlertDescription className="text-amber-300/90">
                <span className="font-semibold text-amber-400">
                  {getToolName(restrictedTool)}
                </span>{" "}
                is a Pro feature.{" "}
                {reason ||
                  "Upgrade your plan to unlock this and other powerful tools."}
              </AlertDescription>
            </Alert>
          )}

          {/* Pro Features List */}
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/10 px-5 py-3 border-b border-white/10">
              <p className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">
                Pro Plan Includes
              </p>
            </div>
            <div className="divide-y divide-white/5">
              {PRO_FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="flex items-start gap-4 px-5 py-4"
                  >
                    <div className="p-1.5 bg-white/5 rounded-md shrink-0">
                      <Icon className="h-4 w-4 text-white/70" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {feature.title}
                      </p>
                      <p className="text-xs text-white/50 mt-0.5">
                        {feature.description}
                      </p>
                    </div>
                    <Check className="h-4 w-4 text-green-400 shrink-0 ml-auto mt-0.5" />
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-center text-white/30">
            Contact your administrator to enable Pro features.
          </p>
        </div>

        <DialogFooter className="justify-center gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-white/60 hover:text-white"
          >
            Maybe Later
          </Button>
          <Button
            className="bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-semibold hover:opacity-90"
            onClick={onClose}
          >
            <Crown className="h-4 w-4 mr-2" />
            Got It
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
