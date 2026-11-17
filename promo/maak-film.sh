#!/usr/bin/env bash
# Maakt de promofilm van begin tot eind: beeld opnemen, muziek synthetiseren, samenvoegen.
#   bash promo/maak-film.sh            alles
#   bash promo/maak-film.sh --mux      alleen opnieuw samenvoegen (beeld en muziek bestaan al)
# Vereist: node met playwright (Chromium), ffmpeg met libx264, python met numpy en scipy.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PYTHON:-python3}
B=promo/build
mkdir -p "$B"

if [[ "${1:-}" != "--mux" ]]; then
  node build.mjs
  node promo/render.mjs --out "$B/beeld.mp4" --events "$B/events.json"
  "$PY" promo/music.py "$B/events.json" "$B/muziek.wav"
fi

# luidheid in twee stappen naar -16 LUFS, zoals gebruikelijk voor online video
read -r I TP LRA TH < <(ffmpeg -hide_banner -nostats -i "$B/muziek.wav" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 \
  | awk -F'"' '/input_i/{i=$4}/input_tp/{tp=$4}/input_lra/{l=$4}/input_thresh/{t=$4}END{print i, tp, l, t}')
ffmpeg -hide_banner -loglevel error -y -i "$B/muziek.wav" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$I:measured_TP=$TP:measured_LRA=$LRA:measured_thresh=$TH:linear=true" \
  -c:a aac -b:a 160k -ar 48000 "$B/geluid.m4a"

# master in hoge kwaliteit (~45 MB)
ffmpeg -hide_banner -loglevel error -y -i "$B/beeld.mp4" -i "$B/geluid.m4a" -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 21 -profile:v high -pix_fmt yuv420p -g 60 -c:a copy -movflags +faststart -shortest \
  "$B/capaciteitskaart-promo-hq.mp4"

# webversie onder 15 MB, twee passes op vaste bitrate
X="-c:v libx264 -preset slower -b:v 960k -maxrate 2500k -bufsize 5000k -g 90 -profile:v high -pix_fmt yuv420p"
ffmpeg -hide_banner -loglevel error -y -i "$B/beeld.mp4" $X -pass 1 -passlogfile "$B/x264" -an -f null /dev/null
ffmpeg -hide_banner -loglevel error -y -i "$B/beeld.mp4" -i "$B/geluid.m4a" -map 0:v -map 1:a $X -pass 2 -passlogfile "$B/x264" \
  -c:a aac -b:a 128k -movflags +faststart -shortest promo/capaciteitskaart-promo.mp4

ffmpeg -hide_banner -loglevel error -y -ss 20 -i "$B/beeld.mp4" -frames:v 1 -q:v 3 promo/poster.jpg
ls -lh "$B/capaciteitskaart-promo-hq.mp4" promo/capaciteitskaart-promo.mp4 promo/poster.jpg
