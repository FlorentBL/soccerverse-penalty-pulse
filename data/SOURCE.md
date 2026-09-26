# Soccerverse player snapshot

Source: https://downloads.soccerverse.com/svpack/packv2/default.json
Fetched: 2026-09-25
Source SHA-256: `d8cc1fe15c726c7360e259783a9d9a4ba0b9069096f50ecdfa4b434402b6ff3e`
Player count: 179100; maximum ID: 523571.

The official datapack supplies IDs and display names, not playable statistics or ownership. `player-ids.bin` and `rules/pulse/player_bits.inc` are the same membership bitset. `public/players/*.json` are display-name shards. The 1,985 records with missing first and last names display as `Soccerverse player #ID`. Pulse precision is intentionally Arcade-specific, derived deterministically from ID, and is not the Soccerverse `rating_shooting` available through the [official GSP API](https://soccerverse.com/developers/gsp-json-rpc). A future use of that live rating requires pinning a complete, versioned snapshot into the rules blob; no rating snapshot is present here. Regenerate names with `python3 scripts/generate-soccerverse-snapshot.py /path/to/default.json`; the script rejects any source with a different SHA-256.
