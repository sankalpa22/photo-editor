// hooks/use-plan-access.js
import { useAuth } from "@clerk/nextjs";

export function usePlanAccess() {
  // const { has } = useAuth();

  const isPro = true; // has?.({ plan: "pro" }) || false;
  const isFree = false; // !isPro; 

  // Define which tools are available for each plan
  const planAccess = {
    // Free plan tools
    resize: true,
    crop: true,
    adjust: true,
    auto_enhance: true,
    edge_detection: true,
    threshold: true,
    text: true,

    // Pro-only tools
    background: true,
    ai_extender: true,
    ai_edit: true,
  };

  // Helper function to check if user has access to a specific tool
  const hasAccess = (toolId) => {
    return planAccess[toolId] === true;
  };

  // Get restricted tools that user doesn't have access to
  const getRestrictedTools = () => {
    return Object.entries(planAccess)
      .filter(([_, hasAccess]) => !hasAccess)
      .map(([toolId]) => toolId);
  };

  // Check if user has reached project limits
  const canCreateProject = (currentProjectCount) => {
    if (isPro) return true;
    return currentProjectCount < 100; // Free limit
  };

  // Check if user has reached export limits
  const canExport = (currentExportsThisMonth) => {
    if (isPro) return true;
    return currentExportsThisMonth < 20;
  };

  return {
    userPlan: isPro ? "pro" : "free_user",
    isPro,
    isFree,
    hasAccess,
    planAccess,
    getRestrictedTools,
    canCreateProject,
    canExport,
  };
}
