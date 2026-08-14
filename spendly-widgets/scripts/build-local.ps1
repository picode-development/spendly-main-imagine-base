# Local release build for Spendly Widgets - replaces EAS cloud builds.
#
# The repo lives under a path containing '&&', which breaks cmd.exe batch
# scripts (gradlew, CMake prefab) and Metro root detection. So the project
# is mirrored to a clean directory, built there, and the signed APK is
# copied back to ../public/spendly-widgets.apk.
#
# Signs with the SAME keystore EAS used (fetched once to
# ~/.spendly-widgets-signing) so the APK installs over cloud builds.
#
# Usage:  powershell -File scripts/build-local.ps1

$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $PSScriptRoot
$buildDir = "C:\spendly-widgets-build"
$signingDir = Join-Path $env:USERPROFILE ".spendly-widgets-signing"

if (-not (Test-Path (Join-Path $signingDir "release.keystore"))) {
    throw "Missing $signingDir\release.keystore - fetch it from EAS first."
}
$signing = Get-Content (Join-Path $signingDir "keystore.json") -Raw | ConvertFrom-Json

# 1. Mirror the project to the clean build directory (fast after first run)
Write-Host "==> Syncing project to $buildDir"
New-Item -ItemType Directory -Force $buildDir | Out-Null
# /XD with absolute paths - a bare name would exclude every dir with that
# name, including node_modules\**\android which Expo's plugins require
robocopy $appDir $buildDir /MIR /XD (Join-Path $appDir "android") (Join-Path $appDir ".expo") (Join-Path $buildDir "android") /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0

Set-Location $buildDir

# 2. Generate the native android project
Write-Host "==> expo prebuild (android)"
node .\node_modules\expo\bin\cli prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw "prebuild failed" }

# 3. Wire the release keystore into the generated Gradle project
Copy-Item (Join-Path $signingDir "release.keystore") "android\app\release.keystore" -Force
$gradlePath = "android\app\build.gradle"
$gradle = Get-Content $gradlePath -Raw

if ($gradle -notmatch "signingConfigs\.release") {
    $nl = "`r`n"
    $releaseConfig = "        release {" + $nl
    $releaseConfig += "            storeFile file('release.keystore')" + $nl
    $releaseConfig += "            storePassword '" + $signing.keystorePassword + "'" + $nl
    $releaseConfig += "            keyAlias '" + $signing.keyAlias + "'" + $nl
    $releaseConfig += "            keyPassword '" + $signing.keyPassword + "'" + $nl
    $releaseConfig += "        }"
    $gradle = $gradle -replace "(?s)(signingConfigs \{.*?keyPassword 'android'\r?\n        \})", ('$1' + $nl + $releaseConfig)
    $gradle = $gradle -replace "signingConfig signingConfigs\.debug(\r?\n\s*def enableShrinkResources)", 'signingConfig signingConfigs.release$1'
    # BOM-less UTF-8 - PS 5.1's -Encoding utf8 writes a BOM Gradle rejects
    [System.IO.File]::WriteAllText((Resolve-Path $gradlePath), $gradle, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "==> release signing wired into build.gradle"
}

# 4. Toolchain
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
if (-not $env:JAVA_HOME) {
    $jdk = @(
        Get-ChildItem "C:\Program Files\Java" -Directory -Filter "jdk*" -ErrorAction SilentlyContinue
        Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -Filter "jdk*" -ErrorAction SilentlyContinue
        Get-ChildItem "C:\Program Files\Microsoft" -Directory -Filter "jdk*" -ErrorAction SilentlyContinue
    ) | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $jdk) { throw "No JDK found - install JDK 17+" }
    $env:JAVA_HOME = $jdk.FullName
}
Write-Host "==> ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "==> JAVA_HOME=$env:JAVA_HOME"

# 5. Build
Write-Host "==> gradlew assembleRelease"
Set-Location "android"
.\gradlew.bat assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { Set-Location $appDir; throw "gradle build failed" }
Set-Location $buildDir

# 6. Ship the APK + version manifest back into the repo. Widgets poll the
# manifest and show their update bar when a newer build is published.
$apk = "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apk)) { throw "APK not found at $apk" }
Copy-Item $apk (Join-Path $appDir "..\public\spendly-widgets.apk") -Force
Set-Location $appDir

$appJson = Get-Content "app.json" -Raw | ConvertFrom-Json
$manifest = @{
    version = $appJson.expo.version
    versionCode = $appJson.expo.android.versionCode
    apkUrl = "/spendly-widgets.apk"
} | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText(
    (Join-Path (Resolve-Path "..\public") "spendly-widgets-version.json"),
    $manifest,
    (New-Object System.Text.UTF8Encoding $false))

$size = [Math]::Round((Get-Item "..\public\spendly-widgets.apk").Length / 1MB, 1)
Write-Host "==> Done: public/spendly-widgets.apk - $size MB (v$($appJson.expo.version), build $($appJson.expo.android.versionCode))"
