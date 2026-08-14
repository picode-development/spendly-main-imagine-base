import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Updates from "expo-updates";

// Native checkOnLaunch only runs at a genuine cold start (full process
// kill + restart), and even then only applies a downloaded update on the
// NEXT cold start. Reopening a backgrounded-but-still-warm app satisfies
// neither condition, so updates sit downloaded but inert. This checks and
// applies explicitly whenever the app is foregrounded, matching the
// reopen-and-you're-updated behavior of other Expo/OTA apps.
const MIN_CHECK_INTERVAL_MS = 30_000;

const checkAndApply = async () => {
    try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew) await Updates.reloadAsync();
    } catch {
        // Offline, dev mode, or the update server is unreachable — keep
        // running on whatever bundle is already loaded
    }
};

export const useOtaUpdateCheck = () => {
    const lastCheckRef = useRef(0);

    useEffect(() => {
        const runIfDue = () => {
            const now = Date.now();
            if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
            lastCheckRef.current = now;
            void checkAndApply();
        };

        runIfDue();
        const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
            if (state === "active") runIfDue();
        });
        return () => sub.remove();
    }, []);
};
