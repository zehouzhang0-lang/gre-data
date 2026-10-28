param([string]$JavaHome = 'C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot')
$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$output = Join-Path ([System.IO.Path]::GetTempPath()) ('gre-native-login-support-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output | Out-Null
# Pure fixtures: no Android runtime, account files, loopback sockets or remote requests.
& (Join-Path $JavaHome 'bin/javac.exe') -encoding UTF-8 -d $output (Join-Path $mobileRoot 'android/app/src/main/java/cn/grestudy/vocabulary/PlanLoginSupport.java') (Join-Path $mobileRoot 'tests/native/PlanLoginSupportTest.java')
if ($LASTEXITCODE -ne 0) { throw 'Native login support regression compilation failed.' }
& (Join-Path $JavaHome 'bin/java.exe') -cp $output cn.grestudy.vocabulary.PlanLoginSupportTest
if ($LASTEXITCODE -ne 0) { throw 'Native login support regressions failed.' }
