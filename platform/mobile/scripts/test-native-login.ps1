param([string]$JavaHome = 'C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot')
$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$output = Join-Path ([System.IO.Path]::GetTempPath()) ('gre-native-login-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output | Out-Null
# Compile only the pure Java deadline controller and isolated fakes. Never open app storage.
& (Join-Path $JavaHome 'bin/javac.exe') -encoding UTF-8 -d $output (Join-Path $mobileRoot 'android/app/src/main/java/cn/grestudy/vocabulary/PlanOperation.java') (Join-Path $mobileRoot 'android/app/src/main/java/cn/grestudy/vocabulary/PlanCallbackDelivery.java') (Join-Path $mobileRoot 'tests/native/PlanOperationTest.java')
if ($LASTEXITCODE -ne 0) { throw 'Native login regression compilation failed.' }
& (Join-Path $JavaHome 'bin/java.exe') -cp $output cn.grestudy.vocabulary.PlanOperationTest
if ($LASTEXITCODE -ne 0) { throw 'Native login regressions failed.' }
