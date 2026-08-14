const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Adds a translucent PopupActivity that handles the spendlywidgets://
// scheme. Launched from a widget button it draws the voice/search popup
// OVER the launcher (or whatever is on screen) instead of opening the
// full app - the home screen stays visible behind the dimmed backdrop.
function withPopupActivity(config) {
    config = withAndroidManifest(config, (mod) => {
        const app = mod.modResults.manifest.application?.[0];
        if (!app) return mod;
        app.activity = app.activity ?? [];
        const exists = app.activity.some((a) => a.$["android:name"] === ".PopupActivity");
        if (!exists) {
            app.activity.push({
                $: {
                    "android:name": ".PopupActivity",
                    "android:exported": "true",
                    "android:theme": "@style/PopupTheme",
                    "android:excludeFromRecents": "true",
                    "android:taskAffinity": "com.spendly.widgets.popup",
                    "android:launchMode": "singleTask",
                    "android:configChanges": "keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode",
                },
                "intent-filter": [
                    {
                        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
                        category: [
                            { $: { "android:name": "android.intent.category.DEFAULT" } },
                            { $: { "android:name": "android.intent.category.BROWSABLE" } },
                        ],
                        data: [{ $: { "android:scheme": "spendlywidgets" } }],
                    },
                ],
            });
        }
        return mod;
    });

    config = withDangerousMod(config, [
        "android",
        (mod) => {
            const root = mod.modRequest.platformProjectRoot;
            const pkgDir = path.join(root, "app/src/main/java/com/spendly/widgets");
            const mainPath = path.join(pkgDir, "MainActivity.kt");

            // PopupActivity mirrors the generated MainActivity (same React
            // component, same delegate) - only the window theme differs
            const main = fs.readFileSync(mainPath, "utf8");
            const popup = main
                .replace(/class MainActivity/g, "class PopupActivity")
                .replace(/MainActivity::class/g, "PopupActivity::class");
            fs.writeFileSync(path.join(pkgDir, "PopupActivity.kt"), popup);

            // Translucent theme: transparent window so the launcher shows
            // through; the React backdrop provides the dim
            const stylesPath = path.join(root, "app/src/main/res/values/styles.xml");
            let styles = fs.readFileSync(stylesPath, "utf8");
            if (!styles.includes("PopupTheme")) {
                const popupTheme = [
                    '  <style name="PopupTheme" parent="AppTheme">',
                    '    <item name="android:windowIsTranslucent">true</item>',
                    '    <item name="android:windowBackground">@android:color/transparent</item>',
                    '    <item name="android:windowContentOverlay">@null</item>',
                    '    <item name="android:windowNoTitle">true</item>',
                    '    <item name="android:windowAnimationStyle">@android:style/Animation.Dialog</item>',
                    "  </style>",
                ].join("\n");
                styles = styles.replace("</resources>", `${popupTheme}\n</resources>`);
                fs.writeFileSync(stylesPath, styles);
            }
            return mod;
        },
    ]);

    return config;
}

module.exports = withPopupActivity;
