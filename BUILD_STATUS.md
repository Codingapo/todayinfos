# Build Status — v0.5.1 Dashboard Validation UX

This release improves the TodayInfo dashboard editor and fixes confusing content-validation errors such as:

- `Too big: expected string to have <=60 characters`
- `Too big: expected string to have <=320 characters`

## Validation improvements
- Tag length increased from 60 to 120 characters per tag.
- SEO description storage increased from 320 to 1,000 characters.
- Summary limit increased to 2,000 characters.
- Category and slug limits were made more practical.
- Related-link, document and topic titles use centralized limits.
- Backend validation now returns exact field paths.
- Important Zod messages now use readable field names instead of raw “Too big” messages.

## Dashboard editor improvements
- Live character counters for limited fields.
- Recommended SEO lengths are shown separately from hard storage limits.
- SEO search-result preview updates while typing.
- Tags are rendered as live chips with per-tag character counts.
- Oversized tags are highlighted before Save.
- Invalid fields are outlined and receive inline error messages.
- A validation summary lists every field that needs attention.
- The first invalid field is automatically focused.
- Save buttons show `Saving…` / `Creating…` and are disabled during submission.
- Dynamic content-type fields and newly added topics/links receive the same live limits.
- Document names are validated before upload.

## API
- New admin endpoint: `GET /admin/api/content-constraints`.
- The dashboard consumes limits from the backend so client/server validation stays aligned.

No public API behavior, AI features, prediction features, or published-content structure was removed.
