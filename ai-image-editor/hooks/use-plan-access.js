// hooks/use-plan-access.js
// All features are fully unlocked - no plan restrictions
export function usePlanAccess() {
  const hasAccess = () => true;
  const canCreateProject = () => true;
  const canExport = () => true;
  const getRestrictedTools = () => [];

  return {
    userPlan: "pro",
    isPro: true,
    isFree: false,
    hasAccess,
    planAccess: {},
    getRestrictedTools,
    canCreateProject,
    canExport,
  };
}
