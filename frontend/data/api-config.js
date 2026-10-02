// TodayInfo public frontend runtime configuration.
// Change the order here when moving providers; the application can fail over without a rebuild.
(() => {
  const local = ['localhost','127.0.0.1'].includes(location.hostname) ? `${location.origin}/api/v1` : null;
  const apiBases = [
    local,
    'https://api.todayinfo.co.za/api/v1',
    'https://todayinfos.onrender.com/api/v1'
  ].filter(Boolean);
  window.TODAYINFO_CONFIG = {
    siteOrigin: 'https://todayinfo.co.za',
    apiBases,
    cacheTtlMs: 60_000,
    staleTtlMs: 86_400_000,
    requestTimeoutMs: 20_000
  };
  window.TODAYINFO_API_BASES = apiBases;
  window.TODAYINFO_API_BASE = apiBases[0];
})();