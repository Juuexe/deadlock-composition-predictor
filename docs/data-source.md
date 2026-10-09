# Deadlock data source assessment

Verified on October 9, 2026 against https://api.deadlock-api.com/openapi.json and live REST responses.

- Hero catalog: GET /v1/assets/heroes?only_active=true. Store only ID and name.
- Historical sample: GET /v1/matches/metadata with include_info=true, include_player_info=false and extra_player_columns=hero_id,team.
- Explicitly request normal games and ranked/unranked matches. Do not filter by player skill or account.
- Bulk metadata still includes account IDs and skill badges; discard those fields immediately. Never save the raw match response or log it.
- Observed winner values: Team0 / Team1; completed outcome: TeamWin. Observed timestamps use YYYY-MM-DD HH:mm:ss, treated as UTC.
- Bulk metadata documents an IP rate limit of 30 requests/minute. The importer makes one bulk request per run and reports HTTP failures without automatic retry.
- GET /v1/sql is deprecated. Use the public hourly data lake for large historical extraction: https://deadlock-api.com/data-dumps and https://data.deadlock-api.com/v1/manifest.json.

First live smoke test saved 1000 valid 6v6 matches and 41 active heroes. The matches spanned approximately 45 minutes. This establishes access and parsing only; it is far too narrow to establish composition effects across patches or calibrated win probabilities.

Next: obtain a representative historical slice, verify timestamp/patch mappings, and assess sample coverage before training. Model inputs remain hero IDs only. Outcomes are training labels, and timestamps support splitting and patch selection rather than serving as player-performance features.
