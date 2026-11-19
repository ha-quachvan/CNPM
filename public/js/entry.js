import { api } from './api.js';
try {
  const user = await api('/me');
  location.replace(`/pages/${user.role.toLowerCase()}/index.html`);
} catch {
  location.replace('/pages/auth/login.html');
}
