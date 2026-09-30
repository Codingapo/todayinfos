export const ROLE_PERMISSIONS = {
  owner: ['*'],
  super_admin: ['dashboard.view','imports.*','posts.*','media.*','analytics.view','team.*','settings.*','audit.view'],
  content_manager: ['dashboard.view','imports.view','imports.fetch','imports.review','posts.*','media.*','analytics.view'],
  editor: ['dashboard.view','imports.view','imports.review','posts.view','posts.create','posts.edit','media.view','media.upload'],
  hiring_manager: ['dashboard.view','imports.view','imports.fetch','imports.review','posts.view','posts.create','posts.edit','posts.publish','media.view','media.upload','analytics.view'],
  analyst: ['dashboard.view','analytics.view','posts.view'],
  security_admin: ['dashboard.view','team.*','audit.view'],
  viewer: ['dashboard.view','posts.view','analytics.view']
};

export function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.some(p => p === '*' || p === permission || (p.endsWith('.*') && permission.startsWith(p.slice(0, -1))));
}
