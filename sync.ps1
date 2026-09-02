$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location $PSScriptRoot

$ExpectedRemote = 'https://github.com/zehouzhang0-lang/gre-data.git'
$BlockedPathPattern = '(?i)(^|/)(\.env($|\.)|private/|\.gre-media/)|\.(pdf|epub|mobi|docx?|pptx?|zip|7z|rar|mp3|m4a|wav|aac|flac|ogg|mp4|mov|avi|mkv|png|jpe?g|gif|webp|heic|key|pem|pfx|p12)$'
$MaxTrackedBytes = 5MB

function Invoke-Git {
  param([Parameter(Mandatory)][string[]]$GitArgs)
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
}
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') {
  throw "Expected branch main, found '$branch'. Stop and inspect before syncing."
}

$remote = (& git remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $remote -ne $ExpectedRemote) {
  throw "Unexpected origin remote: '$remote'. Expected '$ExpectedRemote'."
}

Invoke-Git -GitArgs @('pull', '--rebase', '--autostash', 'origin', 'main')

$dirty = & git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'git status failed.' }

if ($dirty) {
  Invoke-Git -GitArgs @('add', '-A')

  $staged = @(& git diff --cached --name-only --diff-filter=ACMR)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect staged files.' }

  $blocked = @($staged | Where-Object { ($_ -replace '\\', '/') -match $BlockedPathPattern })
  if ($blocked.Count -gt 0) {
    throw "Blocked private or binary files are staged. Nothing was committed:`n$($blocked -join "`n")"
  }

  $oversized = @()
  foreach ($relativePath in $staged) {
    $fullPath = Join-Path $PSScriptRoot $relativePath
    if ((Test-Path -LiteralPath $fullPath -PathType Leaf) -and (Get-Item -LiteralPath $fullPath).Length -gt $MaxTrackedBytes) {
      $oversized += $relativePath
    }
  }
  if ($oversized.Count -gt 0) {
    throw "Files larger than 5 MB are staged. Nothing was committed:`n$($oversized -join "`n")"
  }

  Invoke-Git -GitArgs @('diff', '--cached', '--check')
  Invoke-Git -GitArgs @('commit', '-m', "practice: $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
  Invoke-Git -GitArgs @('push', 'origin', 'main')
  Write-Output 'Sync complete: new GRE data pushed.'
} else {
  Invoke-Git -GitArgs @('push', 'origin', 'main')
  Write-Output 'Sync complete: no new GRE data.'
}
