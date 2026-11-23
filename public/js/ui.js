export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const money = (value) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
export const date = (value) =>
  value
    ? new Date(value).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : '—';
export const labels = {
  CUSTOMER: 'Khách hàng',
  OPERATOR: 'Điều hành',
  TECHNICIAN: 'Kỹ thuật viên',
  ACTIVE: 'Đang hoạt động',
  MAINTENANCE: 'Bảo trì',
  CLOSED: 'Tạm đóng',
  AVAILABLE: 'Sẵn sàng',
  RESERVED: 'Đang giữ',
  IN_USE: 'Đang sử dụng',
  CHARGING: 'Đang sạc',
  CONNECTED: 'Chờ ngắt kết nối',
  AWAITING_DISCONNECT: 'Chờ ngắt kết nối',
  DISPATCH_RESERVED: 'Đã giữ điều phối',
  IN_TRANSIT: 'Đang vận chuyển',
  FREE: 'Còn trống',
  HELD: 'Đang giữ chỗ',
  OCCUPIED: 'Đang sử dụng',
  FAULT: 'Cần kiểm tra',
  WAITING: 'Đang chờ cấp',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  OPEN: 'Chưa tiếp nhận',
  ASSIGNED: 'Đang xử lý',
  RESOLVED: 'Đã xử lý',
  PENDING: 'Chờ tiếp nhận',
  E_BIKE: 'Xe đạp điện',
  E_MOTORBIKE: 'Xe máy điện',
  VEHICLE: 'Đặt xe',
  PARKING: 'Chỗ đỗ',
  SHARED: 'Dùng chung',
  PERSONAL: 'Cá nhân',
  DEMAND_SURGE: 'Nhu cầu cấp xe tại Hub',
  HUB_FULL: 'Giải phóng chỗ đỗ',
  CHARGING_SURGE: 'Thêm yêu cầu sạc',
  PORT_FAILURE: 'Cổng sạc lỗi',
  VEHICLE_IMBALANCE: 'Cân bằng xe toàn mạng lưới',
};
export const label = (v) => labels[v] || v || '—';
const paths = {
  bike: 'M18 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M0 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 17l5-10 5 10H3m5-10h7l6 10M6 4h4m5 3V3h3',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  calendar:
    'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
  route:
    'M7 4a3 3 0 1 1-6 0a3 3 0 1 1 6 0M23 20a3 3 0 1 1-6 0a3 3 0 1 1 6 0M4 7v9a4 4 0 0 0 4 4h9M20 17V8a4 4 0 0 0-4-4h-3',
  bolt: 'm13 2-9 12h7l-1 8 10-12h-7l1-8Z',
  alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v1',
  truck:
    'M1 4h13v13H1zM14 9h5l4 4v4h-9M8 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0M21 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  flask: 'M9 3h6m-5 0v7l-6 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-9V3M8 15h8',
  user: 'M16 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0M4 21v-2a7 7 0 0 1 14 0v2',
  logout: 'M9 21H3V3h6m6 5 5 4-5 4m-8-4h13',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  arrowUp: 'm7 17 10-10M7 7h10v10',
  chevron: 'm9 5 7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  search: 'M19 10a8 8 0 1 1-16 0a8 8 0 1 1 16 0m-3 6 5 5',
  clock: 'M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0M12 6v6l4 2',
  parking: 'M5 3h14v18H5zM9 17V7h4a3 3 0 0 1 0 6H9',
  building: 'M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 7v2m8-2v2M8 11v2m8-2v2',
  check: 'm5 12 4 4 10-10',
  close: 'm6 6 12 12M6 18 18 6',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  refresh: 'M20 7a9 9 0 1 0 1 8M20 2v5h-5',
  menu: 'M3 6h18M3 12h18M3 18h18',
  battery: 'M2 7h17v10H2zM22 10v4M6 10v4m4-4v4m4-4v4',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10s-9-5-9-10V6l9-4Zm-4 10 3 3 5-6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  inbox: 'M4 3h16l2 14v4H2v-4L4 3Zm-2 14h6l2 3h4l2-3h6',
};
export const icon = (name, cls = '') =>
  `<svg class="icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.grid}"/></svg>`;
export function badge(status) {
  const color = ['ACTIVE', 'AVAILABLE', 'FREE', 'COMPLETED', 'RESOLVED'].includes(status)
    ? 'good'
    : ['FAULT', 'MAINTENANCE', 'EXPIRED', 'CANCELLED', 'CLOSED'].includes(status)
      ? 'muted'
      : ['OPEN'].includes(status)
        ? 'warn'
        : 'blue';
  return `<span class="badge ${color}"><i></i>${esc(label(status))}</span>`;
}
export const button = (text, action, id = '', cls = 'secondary', glyph = '') =>
  `<button type="button" class="btn ${cls}" data-action="${esc(action)}" data-id="${esc(id)}">${esc(text)}</button>`;
export const option = (value, title, selected) =>
  `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(title)}</option>`;
export const empty = (title, desc, action = '') =>
  `<div class="empty"><h3>${esc(title)}</h3><p>${esc(desc)}</p>${action}</div>`;
export function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast ${error ? 'error' : ''}`;
  node.dataset.message = message;
  node.setAttribute('role', error ? 'alert' : 'status');
  node.innerHTML = icon(error ? 'alert' : 'check') + `<span>${esc(message)}</span>`;
  const container = document.querySelector('#toasts');
  for (const previous of [...container.children])
    if (previous.dataset.message === message) previous.remove();
  while (container.children.length >= 2) container.firstElementChild.remove();
  container.append(node);
  setTimeout(() => node.remove(), 4200);
}
export function modal(title, content, onSubmit, submitText = 'Xác nhận') {
  const dialog = document.querySelector('#dialog');
  const oldFocus = document.activeElement;
  dialog.innerHTML = `<form id="dialog-form"><div class="dialog-head"><div><span class="eyebrow">E-MOBILITY HUB</span><h2>${esc(title)}</h2></div><button type="button" class="icon-btn" data-close aria-label="Đóng">${icon('close')}</button></div><div class="dialog-body">${content}<div class="form-error" id="dialog-error" role="alert" hidden></div></div><div class="dialog-foot"><button type="button" class="btn secondary" data-close>${onSubmit ? 'Quay lại' : 'Đóng'}</button>${onSubmit ? `<button class="btn primary" type="submit">${esc(submitText)}</button>` : ''}</div></form>`;
  const close = () => {
    dialog.close();
    oldFocus?.focus();
  };
  dialog.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', close));
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
        close();
    }
  };
  dialog.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const submit = dialog.querySelector('[type=submit]');
    submit.disabled = true;
    const error = dialog.querySelector('#dialog-error');
    error.hidden = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(e.target)), e.target);
      close();
    } catch (err) {
      error.textContent =
        err.message +
        (err.details?.returnConfirmed === false
          ? ` Phí dự tính: ${money(err.details.fee)}; phạt: ${money(err.details.penalty)}.`
          : '');
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  };
  if (!dialog.open) dialog.showModal();
}
export function field(name, title, input, help = '') {
  return `<label class="field"><span>${esc(title)}</span>${input}${help ? `<small>${esc(help)}</small>` : ''}</label>`;
}
export const input = (name, type = 'text', value = '', extra = '') =>
  `<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}>`;
export const select = (name, options, extra = '') =>
  `<select name="${esc(name)}" ${extra}>${options}</select>`;
