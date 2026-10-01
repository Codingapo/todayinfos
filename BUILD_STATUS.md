# Build Status — v0.3.1

Recommendation relationships and Import Inbox workflow update.

- Import Ignore action and ignored status are removed.
- Legacy ignored imports are returned to unreviewed by migration 003.
- Recommendations can be selected from existing TodayInfo posts.
- Administrators can also add custom recommendation titles + URLs.
- Explicit related/recommended links from fetched source records are preserved.
- Generic fetched links are only retained when rule-based similarity shows they are useful relatives.
- Application URLs, social links, archive/tag/category links and boilerplate links are excluded from recommendations.
- Public detail JSON exposes custom/source links as recommendation_links.
- Existing TodayInfo selected recommendations remain in recommendations.
- Deep sync, source memory, 100-page fetching and psychometric-test support remain intact.
- Browser admin JavaScript is now included in the syntax check.
- No AI or prediction functionality is present.
