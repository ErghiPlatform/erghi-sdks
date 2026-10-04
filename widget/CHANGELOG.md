## Unreleased

- Use the workspace's branding: logo, theme (light/dark/auto), position, corner radius, and the
  secondary colour as an accent (focus rings, source links, typing dots, unread dot). Script-tag
  attributes still override, and `data-theme` is now read.
- Real dark theme, including `auto` following the visitor's system setting.
- Start-up requests give up after 3 s so a slow API can't keep the widget from appearing.
- Colours are accepted only as hex, so a bad value can't break or inject into the widget's CSS.

## 1.0.1

- Fix package description metadata (no functional changes).

## 1.0.0

- Initial release.
