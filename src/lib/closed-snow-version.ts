export const RELOADED_BUILD_STORAGE_KEY = "closed-snow:reloaded-build";
export const AUTO_RELOAD_COOLDOWN_MS = 5 * 60_000;
export const REFRESH_QUERY_PARAM = "cs_refresh";
export const EXPECTED_BUILD_QUERY_PARAM = "cs_build";

export type ReloadGuard = {
  build: string;
  at: number;
};

export function currentBuildId(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_GIT_COMMIT_SHA ?? "dev";
}

export function parseReloadGuard(
  raw: string | null | undefined,
): ReloadGuard | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { build?: unknown; at?: unknown };
    if (
      typeof parsed?.build === "string" &&
      parsed.build.length > 0 &&
      typeof parsed.at === "number" &&
      Number.isFinite(parsed.at)
    ) {
      return { build: parsed.build, at: parsed.at };
    }
  } catch {
    return null;
  }
  return null;
}

export function shouldAutoReloadForBuild({
  currentBuild,
  remoteBuild,
  expectedBuildInUrl,
  guard,
  now,
}: {
  currentBuild: string;
  remoteBuild: string | null | undefined;
  expectedBuildInUrl: string | null | undefined;
  guard: ReloadGuard | null;
  now: number;
}): boolean {
  if (!currentBuild || !remoteBuild) return false;
  if (currentBuild === "dev" || remoteBuild === "dev") return false;
  if (remoteBuild === currentBuild) return false;
  if (expectedBuildInUrl === remoteBuild) return false;
  if (
    guard?.build === remoteBuild &&
    now - guard.at < AUTO_RELOAD_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

export function buildDocumentRefreshUrl(
  href: string,
  nonce: string,
  expectedBuild?: string | null,
): string {
  const url = new URL(href);
  url.searchParams.set(REFRESH_QUERY_PARAM, nonce);
  if (expectedBuild) {
    url.searchParams.set(EXPECTED_BUILD_QUERY_PARAM, expectedBuild);
  } else {
    url.searchParams.delete(EXPECTED_BUILD_QUERY_PARAM);
  }
  return url.toString();
}

export function cleanRefreshParams(
  href: string,
  currentBuild: string,
): {
  nextUrl: string | null;
  hadManualRefresh: boolean;
  failedExpectedBuild: string | null;
} {
  const url = new URL(href);
  const hadManualRefresh = url.searchParams.has(REFRESH_QUERY_PARAM);
  const expectedBuild = url.searchParams.get(EXPECTED_BUILD_QUERY_PARAM);
  const failedExpectedBuild =
    expectedBuild && expectedBuild !== currentBuild ? expectedBuild : null;

  if (!hadManualRefresh && (!expectedBuild || failedExpectedBuild)) {
    return { nextUrl: null, hadManualRefresh, failedExpectedBuild };
  }

  url.searchParams.delete(REFRESH_QUERY_PARAM);
  if (!failedExpectedBuild) {
    url.searchParams.delete(EXPECTED_BUILD_QUERY_PARAM);
  }
  return {
    nextUrl: `${url.pathname}${url.search}${url.hash}`,
    hadManualRefresh,
    failedExpectedBuild,
  };
}
