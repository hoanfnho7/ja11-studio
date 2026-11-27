Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$jbrHome = "C:\Program Files\Android\Android Studio\jbr"
$jbrBin  = "$jbrHome\bin"
$sdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
$androidJar = "$sdkRoot\platforms\android-37.0\android.jar"
$buildTools = "$sdkRoot\build-tools\36.0.0"

$env:JAVA_HOME = $jbrHome
$env:PATH = "$jbrBin;$env:PATH"

# Remove obsolete WebView bridge if still present
$legacyBridge = Join-Path $root "android\app\src\main\java\com\ja11studio\app\Ja11UsbBridge.java"
if (Test-Path $legacyBridge) {
    Remove-Item -Force $legacyBridge
}

$buildDir = Join-Path $root "android\build"
if (Test-Path $buildDir) {
    Remove-Item -Recurse -Force $buildDir
}
New-Item -ItemType Directory -Force -Path "$buildDir\gen" | Out-Null
New-Item -ItemType Directory -Force -Path "$buildDir\classes" | Out-Null
New-Item -ItemType Directory -Force -Path "$buildDir\dex" | Out-Null

$releaseDir = Join-Path $root "release"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

Write-Host "[1/6] Compiling & linking Pure Native Android resources (aapt2)..."
& "$buildTools\aapt2.exe" compile --dir "$root\android\app\src\main\res" -o "$buildDir\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

& "$buildTools\aapt2.exe" link `
    -o "$buildDir\unaligned.apk" `
    -I "$androidJar" `
    --manifest "$root\android\app\src\main\AndroidManifest.xml" `
    --java "$buildDir\gen" `
    -R "$buildDir\res.zip" `
    --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "[2/6] Compiling 100% Pure Native Android UI, DSP & USB-C HID Engine (javac --release 17)..."
$javaFiles = Get-ChildItem -Recurse "$buildDir\gen", "$root\android\app\src\main\java" -Filter *.java | ForEach-Object { $_.FullName }
& "$jbrBin\javac.exe" --release 17 -encoding UTF-8 -Xlint:unchecked -cp "$androidJar" -d "$buildDir\classes" $javaFiles
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Host "[3/6] Converting bytecode to Dalvik Executable DEX (d8 --min-api 26)..."
$classFiles = Get-ChildItem -Recurse "$buildDir\classes" -Filter *.class | ForEach-Object { $_.FullName }
& "$buildTools\d8.bat" --lib "$androidJar" --min-api 26 --output "$buildDir\dex" $classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Host "[4/6] Packaging pure native classes.dex into APK..."
$apkZipPath = "$buildDir\unaligned.apk"
$zip = [System.IO.Compression.ZipFile]::Open($apkZipPath, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip,
        "$buildDir\dex\classes.dex",
        "classes.dex",
        [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
} finally {
    $zip.Dispose()
}

Write-Host "[5/6] Aligning APK on 4-byte boundary (zipalign)..."
& "$buildTools\zipalign.exe" -f -p 4 "$buildDir\unaligned.apk" "$buildDir\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "[6/6] Signing & verifying JA11-Studio-v3.2.1.apk (APK Signature Scheme v2 + v3)..."
$keystore = Join-Path $root "android\ja11studio-release.jks"
if (-not (Test-Path $keystore)) {
    & "$jbrBin\keytool.exe" -genkeypair `
        -v -keystore $keystore `
        -alias ja11studio `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass ja11studio123 -keypass ja11studio123 `
        -dname "CN=JA11 Studio, OU=Audio, O=JA11Studio, L=HCM, ST=VN, C=VN" | Out-Null
}

$outApk = Join-Path $releaseDir "JA11-Studio-v3.2.1.apk"
& "$buildTools\apksigner.bat" sign `
    --ks $keystore `
    --ks-key-alias ja11studio `
    --ks-pass pass:ja11studio123 `
    --key-pass pass:ja11studio123 `
    --out $outApk `
    "$buildDir\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed" }

& "$buildTools\apksigner.bat" verify --verbose $outApk
if ($LASTEXITCODE -ne 0) { throw "apksigner verify failed" }

$apkInfo = Get-Item $outApk
Write-Host ("SUCCESS! Built Pure Native APK: {0} ({1:N1} KB)" -f $apkInfo.FullName, ($apkInfo.Length / 1KB))
