#!/bin/bash
# usage: fetch.sh queryfile outfile
OP=https://maps.mail.ru/osm/tools/overpass/api/interpreter
for i in $(seq 1 8); do
  curl -sS -m 300 --data-urlencode data@$1 $OP -o $2.tmp
  if head -c 200 $2.tmp | grep -q '"version"'; then mv $2.tmp $2; echo "ok $2 $(du -h $2|cut -f1)"; exit 0; fi
  head -c 300 $2.tmp | tail -c 200; echo " retry $i"; sleep 20
done; exit 1
