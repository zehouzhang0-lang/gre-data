$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& node platform/launch.mjs @args
if ($LASTEXITCODE -ne 0) { throw 'GRE平台启动失败，请查看上方提示。' }
