#!/usr/bin/env bash
# Grandma's old friends, first four (staff design 9): one Codex drawing at a time (two at once hit 429).
cd /c/Users/anjsh/OneDrive/Desktop/monster-bbq
P=$(pwd)
R=art-src/codex/raw
run() { # out prompt images...
  local out=$1 prompt=$2; shift 2
  local args=()
  for im in "$@"; do args+=(--image "$im"); done
  for try in 1 2 3; do
    [ -f "$R/$out" ] && { echo "OK $out"; return 0; }
    echo "== $out (try $try) $(date +%H:%M)"
    codex exec --skip-git-repo-check -s workspace-write -C "$P" "${args[@]}" - < "art-src/codex/$prompt" > "art-src/codex/log-q-${out%.png}.txt" 2>&1
    [ -f "$R/$out" ] && { echo "OK $out"; return 0; }
    grep -q "429" "art-src/codex/log-q-${out%.png}.txt" && { echo "429, waiting"; sleep 300; }
  done
  echo "FAILED $out"
}
for id in park sundeok kkaebi dallae; do run staff_$id.png prompt-staff-$id.txt $R/shop3d_walk.png $R/shop3d_hero.png; done
run staff_portraits_1.png prompt-staff-portraits-1.txt $R/ref_portraits_x6.png $R/hero_portraits.png
echo DONE
