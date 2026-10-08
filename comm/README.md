# comm/ — reference only
`EMU_PUSH_SPEC.md` is the EMU platform's generic push contract (`POST /api/v1/ingest`, per-device key), kept for reference.
The EMU RUT200 scripts (bootstrap self-update, buffered startup) are NOT shipped here on purpose:
loco RUT200s keep running the unchanged `rut200/himnish_push.lua` (+ `loco_push_v14_VIBRATION.lua`).
