# Contract: Profile Import/Export Format

The import/export JSON is a user-facing interchange format (shared between users and
across extension versions). It MUST remain stable.

## Format

A single serialized `Profile` object (see [data-model.md](../data-model.md)):

```json
{
  "title": "Profile 1",
  "hideComment": true,
  "headers": [
    { "enabled": true, "name": "X-Custom", "value": "abc", "comment": "optional note" }
  ],
  "respHeaders": [],
  "filters": [
    { "enabled": true, "type": "urls", "urlRegex": "https://example\\.com/.*" },
    { "enabled": true, "type": "types", "resourceType": ["main_frame", "script"] }
  ],
  "appendMode": ""
}
```

## Rules

- **Export**: produces exactly one JSON object (the profile), pretty-printing optional.
- **Import**: parses one object; on parse failure the target profile is unchanged and the
  user sees "Failed to import profile" (legacy UX). Missing optional fields are filled
  with defaults from the data model.
- **Legacy wildcard patterns**: an imported filter carrying `urlPattern` (instead of
  `urlRegex`) is converted with the legacy wildcard→regex algorithm (escape
  `^$&+?.()|{}[]/`, `\` → `\\`, `*` → `.*`) before use.
- **Forward/backward compatibility**: unknown extra fields are ignored on import and
  preserved nowhere (not re-exported); exports from the new version use only fields in
  this contract so the old extension version can still import them.
