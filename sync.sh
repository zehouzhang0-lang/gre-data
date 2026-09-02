#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

expected_remote='https://github.com/zehouzhang0-lang/gre-data.git'
branch="$(git branch --show-current)"
remote="$(git remote get-url origin)"

if [[ "$branch" != 'main' ]]; then
  echo "Expected branch main, found '$branch'. Stop and inspect before syncing." >&2
  exit 1
fi
if [[ "$remote" != "$expected_remote" ]]; then
  echo "Unexpected origin remote: '$remote'. Expected '$expected_remote'." >&2
  exit 1
fi

git pull --rebase --autostash origin main

if [[ -n "$(git status --porcelain)" ]]; then
  git add -A

  blocked=''
  while IFS= read -r path; do
    if [[ "$path" =~ (^|/)(\.env($|\.)|private/|\.gre-media/) ]] ||
       [[ "$path" =~ \.(pdf|epub|mobi|docx?|pptx?|zip|7z|rar|mp3|m4a|wav|aac|flac|ogg|mp4|mov|avi|mkv|png|jpe?g|gif|webp|heic|key|pem|pfx|p12)$ ]]; then
      blocked+="$path"$'\n'
    fi
  done < <(git diff --cached --name-only --diff-filter=ACMR)

  if [[ -n "$blocked" ]]; then
    echo 'Blocked private or binary files are staged. Nothing was committed:' >&2
    printf '%s' "$blocked" >&2
    exit 1
  fi

  git diff --cached --check
  git commit -m "practice: $(date +'%Y-%m-%d %H:%M')"
  git push origin main
  echo 'Sync complete: new GRE data pushed.'
else
  git push origin main
  echo 'Sync complete: no new GRE data.'
fi
