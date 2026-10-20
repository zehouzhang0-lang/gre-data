param(
    [string]$SdkRoot = (Join-Path $env:LOCALAPPDATA 'GREVocabBuild/sdk'),
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$BuildCache = (Join-Path $env:LOCALAPPDATA 'GREVocabBuild'),
    [switch]$InstallTools,
    [switch]$AcceptSdkLicense,
    [switch]$SkipSeed,
    [switch]$UseTcpSelectorWorkaround
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$previousDirectory = Get-Location
$previousJava = $env:JAVA_HOME
$previousAndroid = $env:ANDROID_HOME
$previousSdk = $env:ANDROID_SDK_ROOT
$previousGradle = $env:GRADLE_USER_HOME
$previousAndroidUser = $env:ANDROID_USER_HOME
$previousJavaToolOptions = $env:JAVA_TOOL_OPTIONS

function Assert-Exit([string]$Action) {
    if ($LASTEXITCODE -ne 0) { throw "$Action failed (exit $LASTEXITCODE)." }
}

function Get-VerifiedDownload([string]$Url, [string]$Destination, [string]$Sha256) {
    if (-not (Test-Path -LiteralPath $Destination)) {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    }
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha256.Trim().ToLowerInvariant()) {
        throw "Checksum mismatch: $Destination. The file was preserved for inspection."
    }
}

try {
    Set-Location -LiteralPath $mobileRoot
    $packageVersion = [string](Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
    if ($packageVersion -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
        throw 'package.json must have a valid version for the APK filename.'
    }
    if (-not $JavaHome -or (-not $PSBoundParameters.ContainsKey('JavaHome') -and -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/jlink.exe')))) {
        $javaCommand = Get-Command java.exe -ErrorAction Stop
        $JavaHome = Split-Path -Parent (Split-Path -Parent $javaCommand.Source)
    }
    if (-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/javac.exe')) -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/jlink.exe'))) {
        throw 'A complete Java 21 JDK (javac and jlink, not an IDE runtime) is required; pass -JavaHome with its installation path.'
    }
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $SdkRoot
    $env:ANDROID_SDK_ROOT = $SdkRoot
    $env:GRADLE_USER_HOME = Join-Path $BuildCache 'gradle-cache'
    $env:ANDROID_USER_HOME = Join-Path $BuildCache 'android-private'
    New-Item -ItemType Directory -Path $BuildCache, (Join-Path $BuildCache 'downloads'), $env:GRADLE_USER_HOME, $env:ANDROID_USER_HOME -Force | Out-Null
    if ($UseTcpSelectorWorkaround) {
        # Some MSIX-launched JDKs cannot connect to their own AF_UNIX pipe. A nonexistent
        # socket directory activates OpenJDK's built-in TCP loopback fallback. Do not create it.
        $noSocketDirectory = Join-Path $BuildCache ('nio-tcp-fallback-' + [guid]::NewGuid().ToString('N'))
        $env:JAVA_TOOL_OPTIONS = "$previousJavaToolOptions -Djdk.net.unixdomain.tmpdir=`"$noSocketDirectory`""
    }
    $sdkManager = Join-Path $SdkRoot 'cmdline-tools/latest/bin/sdkmanager.bat'
    if ($InstallTools) {
        if (-not $AcceptSdkLicense) {
            throw 'Read https://developer.android.com/studio#command-tools and explicitly pass -AcceptSdkLicense to install Android SDK tools.'
        }
        if (-not (Test-Path -LiteralPath $sdkManager)) {
            $toolsArchive = Join-Path $BuildCache 'downloads/commandlinetools-win-15859902_latest.zip'
            Get-VerifiedDownload 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' $toolsArchive '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
            $extract = Join-Path $BuildCache ('tools-extract-' + [guid]::NewGuid().ToString('N'))
            Expand-Archive -LiteralPath $toolsArchive -DestinationPath $extract
            $toolsDestination = Join-Path $SdkRoot 'cmdline-tools/latest'
            New-Item -ItemType Directory -Path $toolsDestination -Force | Out-Null
            Copy-Item -Path (Join-Path $extract 'cmdline-tools/*') -Destination $toolsDestination -Recurse
        }
        # Install only the required platform packages. License acceptance is explicit, never implicit.
        1..12 | ForEach-Object { 'y' } | & $sdkManager "--sdk_root=$SdkRoot" 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'
        Assert-Exit 'Android SDK installation'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $SdkRoot 'platforms/android-36/android.jar'))) {
        throw 'Android SDK 36 is missing. Install it or run this script with -InstallTools -AcceptSdkLicense after reviewing its license.'
    }
    $gradleVersion = '8.14.3'
    $gradle = Join-Path $BuildCache "gradle-$gradleVersion/bin/gradle.bat"
    if (-not (Test-Path -LiteralPath $gradle)) {
        $gradleUrl = "https://downloads.gradle.org/distributions/gradle-$gradleVersion-bin.zip"
        $hashResponse = Invoke-WebRequest -Uri "$gradleUrl.sha256" -UseBasicParsing
        $gradleHash = if ($hashResponse.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($hashResponse.Content) } else { [string]$hashResponse.Content }
        $gradleArchive = Join-Path $BuildCache "downloads/gradle-$gradleVersion-bin.zip"
        Get-VerifiedDownload $gradleUrl $gradleArchive $gradleHash
        Expand-Archive -LiteralPath $gradleArchive -DestinationPath $BuildCache
    }
    if (-not (Test-Path -LiteralPath 'node_modules/@capacitor/cli')) {
        & npm.cmd ci --no-audit --no-fund
        Assert-Exit 'Install mobile dependencies'
    }
    if (-not (Test-Path -LiteralPath 'android/gradle/wrapper/gradle-wrapper.jar')) {
        # Regenerate this ignored binary from the integrity-locked Capacitor template.
        & tar.exe -xzf 'node_modules/@capacitor/cli/assets/android-template.tar.gz' -C android 'gradle/wrapper/gradle-wrapper.jar'
        Assert-Exit 'Restore Gradle wrapper binary'
    }
    if (-not $SkipSeed) {
        & node 'scripts/export-vocabulary.mjs'
        Assert-Exit 'Export offline vocabulary'
    }
    if (-not (Test-Path -LiteralPath 'public/vocabulary-seed.json')) {
        throw 'The personal offline word library public/vocabulary-seed.json is missing. Refusing to produce an empty-library APK.'
    }
    & node 'scripts/verify-pronunciation.mjs'
    Assert-Exit 'Verify offline pronunciation coverage and file integrity'
    & node 'scripts/export-practice.mjs'
    Assert-Exit 'Export offline question bank and existing practice history'
    & npm.cmd run build
    Assert-Exit 'Build offline web resources'
    & npx.cmd cap sync android
    Assert-Exit 'Copy local resources into Android project'
    Push-Location -LiteralPath (Join-Path $mobileRoot 'android')
    try {
        & $gradle --no-daemon --console=plain "-Dorg.gradle.java.home=$JavaHome" assembleDebug
        Assert-Exit 'Build debug APK'
    } finally { Pop-Location }
    $releaseDirectory = Join-Path $mobileRoot 'releases'
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    $apk = Join-Path $releaseDirectory "GRE-vocabulary-$packageVersion-debug.apk"
    Copy-Item -LiteralPath 'android/app/build/outputs/apk/debug/app-debug.apk' -Destination $apk
    $apksigner = Join-Path $SdkRoot 'build-tools/36.0.0/apksigner.bat'
    & $apksigner verify --verbose $apk
    Assert-Exit 'Verify APK signature'
    Write-Host "APK: $apk"
    Write-Host ('SHA256: ' + (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash)
    Write-Host 'Personal preview/debug build. Keep the local debug signing key to install future updates without uninstalling.'
} finally {
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousAndroid
    $env:ANDROID_SDK_ROOT = $previousSdk
    $env:GRADLE_USER_HOME = $previousGradle
    $env:ANDROID_USER_HOME = $previousAndroidUser
    $env:JAVA_TOOL_OPTIONS = $previousJavaToolOptions
    Set-Location -LiteralPath $previousDirectory
}
