#!/usr/bin/env bash
# Grandma's other eight old friends (staff design 9, second batch): one Codex drawing at a time.
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
for id in hongmae soedol ppareun ggultteok jang baekhwa baekdu mumyeong; do run staff_$id.png prompt-staff-$id.txt $R/shop3d_walk.png $R/staff_sundeok.png; done
run staff_portraits_2.png prompt-staff-portraits-2.txt $R/staff_portraits_1.png
run staff_portraits_3.png prompt-staff-portraits-3.txt $R/staff_portraits_1.png
echo DONE
