// Share the same import promise between startup preloading and React.lazy.
const pending = {};
const loaders = {
  owner: () => import('../screens/owner/OwnerApp').then(m => ({ default: m.OwnerApp })),
  staff: () => import('../screens/Staff').then(m => ({ default: m.StaffApp })),
  admin: () => import('../screens/Admin').then(m => ({ default: m.AdminApp })),
};
export function loadSignedInScreen(role) {
  if (!loaders[role]) return Promise.resolve(null);
  if (!pending[role]) pending[role] = loaders[role]().catch(error => { delete pending[role]; throw error; });
  return pending[role];
}
