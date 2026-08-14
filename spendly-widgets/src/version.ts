import Constants from "expo-constants";

// The installed build's version, embedded by Expo at build time
export const installedVersionCode = (): number =>
    Constants.expoConfig?.android?.versionCode ?? 1;

export const installedVersionName = (): string =>
    Constants.expoConfig?.version ?? "0.0.0";

export type LatestVersion = { versionCode: number; version: string; apkUrl: string };

// Published next to the APK by scripts/build-local.ps1 on every release
export const fetchLatestVersion = async (baseUrl: string): Promise<LatestVersion | null> => {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        const res = await fetch(`${baseUrl}/spendly-widgets-version.json`, {
            signal: controller.signal,
            headers: { "cache-control": "no-cache" },
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const data = await res.json();
        if (typeof data?.versionCode !== "number") return null;
        return {
            versionCode: data.versionCode,
            version: String(data.version ?? ""),
            apkUrl: String(data.apkUrl ?? "/spendly-widgets.apk"),
        };
    } catch {
        return null;
    }
};

// The update deep link widgets show when a newer build is published
export const updateUriIfNewer = (baseUrl: string, latest: LatestVersion | null): string | undefined =>
    latest && latest.versionCode > installedVersionCode()
        ? `${baseUrl}${latest.apkUrl}`
        : undefined;
