export const RELOADED_BUILD_STORAGE_KEY = "closed-snow:reloaded-build";

export function currentBuildId(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_GIT_COMMIT_SHA ?? "dev";
}

export function shouldReloadForBuild(
  currentBuild: string,
  remoteBuild: string | null | undefined,
  alreadyReloadedFor: string | null | undefined,
): boolean {
  if (!currentBuild || !remoteBuild) return false;
  if (currentBuild === "dev" || remoteBuild === "dev") return false;
  if (remoteBuild === currentBuild) return false;
  return alreadyReloadedFor !== remoteBuild;
}
