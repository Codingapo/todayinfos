# Build Status — v0.2

Implemented requested structured-content revision.

- Removed generated suggestion/prediction functionality.
- Removed university-add/manage module.
- Removed customer-care module.
- Rebuilt editor around “What would you like to update?”.
- Added type-specific News/Bursary/Job/etc. forms.
- Added structured Topics, Tags, Related Links, Related Content, Recommendations, Documents and Navigation.
- Added safe readable link rendering.
- Added automatic/manual bursary status handling.
- Added Supabase Storage uploads in demo/testing mode using SUPABASE_URL1 + SUPABASE_KEY.
- Kept R2 support and local demo fallback.
- Kept psychometric-test import preset.
- Public API now returns frontend-ready type-aware JSON.
- `npm run check`: passes.
- `npm test`: 9/9 passes.

The project does not automatically alter either of the user's existing Supabase databases.
