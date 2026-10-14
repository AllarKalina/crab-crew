#!/bin/sh
# Captures the on-screen Ghostty window only (not the whole screen), to the path given.
# Needs Screen Recording permission for the terminal running it. A locked screen
# stops Ghostty redrawing; read the pane with `herdr pane read <id> --source visible --ansi` instead.
dir=$(cd "$(dirname "$0")" && pwd)
out=${1:-ghostty.png}
id=$(swift "$dir/wins.swift" 2>/dev/null | awk -F'\t' '$3=="Ghostty"{print $1; exit}')
[ -n "$id" ] || { echo "no on-screen Ghostty window" >&2; exit 1; }
screencapture -x -o -l "$id" "$out" && echo "$out"
