export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error?.message || 'Không thể thực hiện yêu cầu.');
    error.code = data.error?.code;
    error.status = res.status;
    error.details = data.error?.details;
    if (res.status === 401 && !path.startsWith('/auth/') && !location.pathname.includes('/auth/'))
      location.replace('/pages/auth/login.html');
    throw error;
  }
  return data;
}
