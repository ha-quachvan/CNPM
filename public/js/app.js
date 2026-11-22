import { api } from './api.js';
import {
  esc,
  icon,
  badge,
  button,
  option,
  empty,
  modal,
  field,
  input,
  select,
  toast,
  label,
  money,
  date,
} from './ui.js';
const state = {
  data: null,
  hubResults: null,
  hubQuery: '',
  reservationTab: 'active',
  incidentStatus: '',
  dispatchStatus: '',
  result: null,
};
let busy = false;
const navItems = {
  CUSTOMER: [
    ['overview', 'Tổng quan', 'grid'],
    ['hubs', 'Tìm Hub', 'pin'],
    ['reservations', 'Đặt chỗ của tôi', 'calendar'],
    ['vehicles', 'Xe cá nhân', 'bike'],
    ['rentals', 'Chuyến đi', 'route'],
    ['charging', 'Sạc xe', 'bolt'],
    ['incidents', 'Báo cáo sự cố', 'alert'],
  ],
  OPERATOR: [
    ['overview', 'Tổng quan mạng lưới', 'grid'],
    ['hubs', 'Quản lý Hub', 'building'],
    ['dispatch', 'Điều phối xe', 'truck'],
    ['charging', 'Quản lý sạc', 'bolt'],
    ['incidents', 'Theo dõi sự cố', 'alert'],
    ['what-if', 'Mô phỏng What-if', 'flask'],
    ['demo', 'Công cụ demo', 'settings'],
  ],
  TECHNICIAN: [
    ['overview', 'Công việc hôm nay', 'grid'],
    ['incidents', 'Xử lý sự cố', 'alert'],
    ['dispatch', 'Lệnh điều phối', 'truck'],
    ['hubs', 'Tra cứu Hub', 'pin'],
  ],
};
const d = () => state.data;
const role = () => d().user.role;
const own = (value) => value.userId === d().user.id;
const find = (collection, id) => d()[collection]?.find((x) => x.id === id);
const hubName = (id) => find('hubs', id)?.name || 'Đang di chuyển';
const vehicleName = (id) => find('vehicles', id)?.code || id;
const techName = (id) => d().team.find((t) => t.id === id)?.fullName || 'Chưa phân công';
const short = (id) => String(id).split('-').slice(-1)[0].slice(0, 8).toUpperCase();
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
const page = () => {
  const p = location.hash.slice(1) || 'overview';
  return [...navItems[role()].map((x) => x[0]), 'profile', 'notifications'].includes(p)
    ? p
    : 'overview';
};
const titleOf = (p) =>
  p === 'notifications'
    ? 'Thông báo'
    : p === 'profile'
      ? 'Hồ sơ cá nhân'
      : navItems[role()].find((x) => x[0] === p)?.[1] || 'Tổng quan';
const stat = (title, value, glyph, note = '') =>
  `<div class="stat"><div class="stat-top"><span>${esc(title)}</span></div><div class="stat-value">${esc(value)}</div><div class="stat-foot">${esc(note)}</div></div>`;
const panel = (title, subtitle, content, action = '') =>
  `<section class="panel"><div class="panel-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${action}</div>${content}</section>`;
const table = (columns, rows) =>
  `<div class="table-wrap"><table><thead><tr>${columns.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const battery = (value, target) =>
  `<span class="battery"><span class="battery-track"><span style="width:${Math.max(0, Math.min(100, Number(value)))}%"></span></span>${Math.round(value)}%${target ? ` / ${target}%` : ''}</span>`;
const countdown = (r) =>
  `<span class="countdown"><span data-expires="${r.expiresAt}"></span></span>`;
const go = (p) => {
  if (location.hash === '#' + p) render();
  else location.hash = p;
};
async function load(force = false) {
  const previous = state.data ? new Set((state.data.notifications || []).map((n) => n.id)) : null;
  state.data = await api('/workspace');
  state.loadedAt = Date.now();
  if (previous) {
    const recent = state.data.notifications.filter((n) => !previous.has(n.id) && !n.readAt);
    if (recent.length) toast(recent[0].title);
  }
  const expected = `/pages/${role().toLowerCase()}/index.html`;
  if (location.pathname !== expected) {
    location.replace(expected + location.hash);
    return;
  }
  if (page() === 'hubs' && state.hubQuery) state.hubResults = await api('/hubs?' + state.hubQuery);
  if (
    force ||
    (!document.querySelector('#dialog').open &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) &&
      !document.querySelector('#whatif-form, #profile-form, #hub-search'))
  )
    render();
}
function shell() {
  const u = d().user;
  const unread = d().notifications.filter((n) => !n.readAt).length;
  document.querySelector('#sidebar').innerHTML =
    `<a class="brand" href="#overview"><span class="brand-mark">EM</span><span><span class="brand-title">E-Mobility Hub</span><span class="brand-sub">ĐHQG-HCM · VẬN HÀNH</span></span></a><div class="nav-section">${esc(label(u.role))}</div><nav>${navItems[u.role].map(([id, title]) => `<a href="#${id}" class="nav-item ${page() === id ? 'active' : ''}" ${page() === id ? 'aria-current="page"' : ''}>${esc(title)}</a>`).join('')}</nav><div class="sidebar-bottom"><a href="#notifications" class="nav-item ${page() === 'notifications' ? 'active' : ''}">Thông báo ${unread ? `<span class="count-pill">${unread}</span>` : ''}</a><a href="#profile" class="nav-item ${page() === 'profile' ? 'active' : ''}">Hồ sơ cá nhân</a><div class="user-block"><span class="avatar">${esc(initials(u.fullName))}</span><div><div class="user-name">${esc(u.fullName)}</div><div class="user-role">${esc(label(u.role))}</div></div><button class="text-logout" data-action="logout">Thoát</button></div></div>`;
  document.querySelector('#topbar').innerHTML =
    `<div class="breadcrumb"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Mở điều hướng">${icon('menu')}</button><span>Không gian làm việc</span><span class="crumb-separator">/</span><strong>${esc(titleOf(page()))}</strong></div><div class="top-meta"><span class="environment-label">Môi trường demo</span><button class="btn secondary small" data-action="go" data-id="notifications">Thông báo${unread ? ` (${unread})` : ''}</button><button class="btn secondary small" data-action="refresh">Làm mới</button></div>`;
}

function mapView() {
  return table(
    ['Hub', 'Xe sẵn sàng', 'Chỗ trống', 'Trạng thái'],
    d().hubs.map(
      (h) =>
        `<tr><td><button class="link-button" data-action="hub-detail" data-id="${esc(h.id)}">${esc(h.name)}</button></td><td>${h.availableVehicles}</td><td>${h.freeSpaces}/${h.totalSpaces}</td><td>${badge(h.status)}</td></tr>`,
    ),
  );
}

function heading(title, desc, action = '') {
  return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${action}</div>`;
}
function quick(title, desc, glyph, view) {
  return `<button class="quick-action" data-action="go" data-id="${view}"><span><b>${esc(title)}</b><small>${esc(desc)}</small></span></button>`;
}
function overview() {
  if (role() === 'OPERATOR') return operatorOverview();
  if (role() === 'TECHNICIAN') return technicianOverview();
  const active = d().reservations.filter((r) => ['HELD', 'WAITING'].includes(r.status));
  const rental = d().rentals.find((r) => r.status === 'ACTIVE');
  const charges = d().chargingSessions.filter((c) => c.status === 'ACTIVE');
  return (
    heading(
      `Xin chào, ${d().user.fullName.split(' ').slice(-1)[0]}`,
      'Theo dõi chuyến đi, xe cá nhân và các yêu cầu đang hoạt động.',
      button('Tìm Hub gần bạn', 'go', 'hubs', 'primary', 'arrow'),
    ) +
    `<div class="cards">${stat(
      'Xe đang sẵn sàng',
      d().hubs.reduce((n, h) => n + h.availableVehicles, 0),
      'bike',
      'Tại các Hub đang hoạt động',
    )}${stat('Đặt chỗ đang giữ', active.length, 'calendar', 'Quản lý thời gian nhận tài nguyên')}${stat('Chuyến đi đang chạy', rental ? 1 : 0, 'route', rental ? vehicleName(rental.vehicleId) : 'Sẵn sàng cho hành trình mới')}${stat('Phiên sạc đang chạy', charges.length, 'bolt', 'Theo dõi mức pin theo thời gian')}</div><div class="split">${panel('Mạng lưới Hub', 'Kết nối các điểm trong khu đô thị', mapView(), button('Xem tất cả', 'go', 'hubs', 'ghost small'))}${panel(
      'Hành trình của bạn',
      'Thông tin cần thiết ngay lúc này',
      `<div class="panel-body">${
        rental
          ? `<div class="notice">Bạn đang sử dụng <strong>${esc(vehicleName(rental.vehicleId))}</strong> từ ${date(rental.startedAt)}.</div>${button('Xem chuyến đi', 'go', 'rentals', 'primary', 'arrow')}`
          : active.length
            ? active
                .slice(0, 2)
                .map(
                  (r) =>
                    `<div class="list-row"><div><p>${esc(label(r.kind))} · ${esc(hubName(r.hubId))}</p><small>${esc(vehicleName(r.vehicleId))}</small></div>${countdown(r)}</div>`,
                )
                .join('') + button('Quản lý đặt chỗ', 'go', 'reservations', 'secondary full')
            : empty(
                'Chưa có đặt chỗ',
                'Chọn một Hub để tìm xe hoặc giữ chỗ cho hành trình tiếp theo.',
                button('Khám phá Hub', 'go', 'hubs', 'secondary', 'pin'),
              )
      }</div>`,
    )}</div><div class="quick-actions">${quick('Đặt xe điện', 'Chọn xe phù hợp cho bạn', 'bike', 'hubs')}${quick('Sạc xe cá nhân', 'Theo dõi và bổ sung năng lượng', 'bolt', 'charging')}${quick('Báo cáo sự cố', 'Gửi thông tin để được hỗ trợ', 'shield', 'incidents')}</div><div style="height:22px"></div>${panel('Các chuyến đi gần đây', 'Lịch sử sử dụng phương tiện', rentalTable(d().rentals.slice().reverse().slice(0, 4)))}`
  );
}
function operatorOverview() {
  const hubs = d().hubs;
  const active = hubs.reduce((sum, h) => sum + h.availableVehicles, 0);
  const occupied = d().spaces.filter((p) => p.status === 'OCCUPIED').length;
  const open = d().incidents.filter((i) => i.status !== 'RESOLVED').length;
  return (
    heading(
      'Tổng quan mạng lưới',
      'Theo dõi nguồn lực và nhịp vận hành trong khu đô thị.',
      button('Tạo lệnh điều phối', 'dispatch-new', '', 'primary', 'plus'),
    ) +
    `<div class="cards">${stat('Hub trong mạng lưới', hubs.length, 'building', `${hubs.filter((h) => h.status === 'ACTIVE').length} Hub đang hoạt động`)}${stat('Xe có thể sử dụng', active, 'bike', 'Xe dùng chung tại các Hub')}${stat('Chỗ đỗ đang dùng', `${occupied}/${d().spaces.length}`, 'parking', 'Không bao gồm các chỗ đang giữ')}${stat('Sự cố cần xử lý', open, 'alert', 'Theo dõi cùng đội kỹ thuật')}</div><div class="split">${panel('Phân bố tài nguyên', 'Chọn một Hub để xem chi tiết', mapView())}${panel(
      'Mức sử dụng chỗ đỗ',
      'Chỗ có xe và chỗ đang được giữ',
      `<div class="panel-body">${hubs
        .map((h) => {
          const used = d().spaces.filter(
            (p) => p.hubId === h.id && ['OCCUPIED', 'HELD'].includes(p.status),
          ).length;
          return `<div class="load-row"><div class="load-label"><span>${esc(h.name)}</span><span class="muted">${h.status === 'ACTIVE' ? `${used}/${h.totalSpaces}` : 'Ngừng phục vụ'}</span></div><div class="progress"><span style="width:${(used / h.totalSpaces) * 100}%"></span></div></div>`;
        })
        .join('')}</div>`,
    )}</div>${panel('Lệnh điều phối gần đây', 'Từ kế hoạch đến xác nhận xe tới Hub đích', dispatchTable(d().dispatchOrders.slice(0, 4)), button('Tất cả lệnh', 'go', 'dispatch', 'ghost small'))}${panel('Sự cố mới nhất', 'Phối hợp với đội kỹ thuật', incidentTable(d().incidents.slice(0, 3)), button('Theo dõi sự cố', 'go', 'incidents', 'ghost small'))}`
  );
}
function technicianOverview() {
  const mine = d().user.id;
  const open = d().incidents.filter((i) => i.status === 'OPEN');
  const assigned = d().incidents.filter((i) => i.technicianId === mine && i.status === 'ASSIGNED');
  const pending = d().dispatchOrders.filter((o) => o.status === 'PENDING');
  const transit = d().dispatchOrders.filter(
    (o) => o.technicianId === mine && o.status === 'IN_TRANSIT',
  );
  return (
    heading(
      'Công việc hôm nay',
      'Tiếp nhận và hoàn tất các nhiệm vụ được phân công.',
      button('Làm mới công việc', 'refresh', '', 'secondary', 'refresh'),
    ) +
    `<div class="cards">${stat('Sự cố chờ nhận', open.length, 'alert', 'Các báo cáo mới từ người dùng')}${stat('Bạn đang xử lý', assigned.length, 'shield', 'Sự cố đã nhận phụ trách')}${stat('Lệnh chờ điều phối', pending.length, 'truck', 'Sẵn sàng để tiếp nhận')}${stat('Đang vận chuyển', transit.length, 'route', 'Lệnh do bạn thực hiện')}</div>${panel('Sự cố cần quan tâm', 'Nhận nhiệm vụ hoặc cập nhật kết quả xử lý', incidentTable([...assigned, ...open].slice(0, 6)), button('Tất cả sự cố', 'go', 'incidents', 'ghost small'))}${panel('Điều phối phương tiện', 'Tiếp nhận, xác minh vị trí và bàn giao xe', dispatchTable([...transit, ...pending].slice(0, 5)), button('Tất cả lệnh', 'go', 'dispatch', 'ghost small'))}`
  );
}
function hubsView() {
  const q = new URLSearchParams(state.hubQuery);
  const hubs = state.hubQuery ? state.hubResults || [] : d().hubs;
  return (
    heading(
      role() === 'CUSTOMER' ? 'Tìm Hub' : 'Tra cứu mạng lưới Hub',
      'Tìm phương tiện, vị trí đỗ và cổng sạc phù hợp.',
    ) +
    `<form id="hub-search" class="toolbar"><label class="search-input" aria-label="Tìm theo tên Hub"><input name="area" placeholder="Tìm theo tên Hub…" value="${esc(q.get('area') || '')}"></label>${select('vehicleType', option('', 'Tất cả loại xe', q.get('vehicleType')) + option('E_BIKE', 'Xe đạp điện', q.get('vehicleType')) + option('E_MOTORBIKE', 'Xe máy điện', q.get('vehicleType')), 'aria-label="Loại xe"')}${select('minBattery', option('', 'Mọi mức pin', q.get('minBattery')) + [30, 50, 70, 90].map((v) => option(String(v), `Pin từ ${v}%`, q.get('minBattery'))).join(''), 'aria-label="Pin tối thiểu"')}${select('needs', option('', 'Mọi tài nguyên', q.get('needsParking') === 'true' ? 'parking' : q.get('needsCharging') === 'true' ? 'charging' : '') + option('parking', 'Còn chỗ đỗ', q.get('needsParking') === 'true' ? 'parking' : '') + option('charging', 'Còn cổng sạc', q.get('needsCharging') === 'true' ? 'charging' : ''), 'aria-label="Nhu cầu"')}<button class="btn primary" type="submit">Tìm kiếm</button></form><div class="inline-status" style="margin-bottom:14px">${hubs.length} Hub phù hợp</div>${hubs.length ? `<div class="hub-grid">${hubs.map((h) => `<article class="hub-card"><div class="hub-top">${badge(h.status)}</div><h3>${esc(h.name)}</h3><span class="hub-address">Khu đô thị ĐHQG-HCM</span><div class="hub-counts"><div><b>${h.availableVehicles}</b><small>Xe sẵn sàng</small></div><div><b>${h.freeSpaces}</b><small>Chỗ đỗ trống</small></div><div><b>${h.freePorts}</b><small>Cổng sạc trống</small></div></div><div class="hub-footer"><span> ${esc(h.openingHours)}</span>${button('Xem Hub', 'hub-detail', h.id, 'secondary small', 'chevron')}</div></article>`).join('')}</div>` : panel('Kết quả tìm kiếm', '', empty('Chưa có Hub phù hợp', 'Thử đổi loại xe, mức pin hoặc tên Hub.', button('Xóa bộ lọc', 'clear-hubs', '', 'secondary')))}`
  );
}
function reservationCard(r) {
  const active = ['HELD', 'WAITING'].includes(r.status);
  const resource =
    r.kind === 'VEHICLE'
      ? vehicleName(r.vehicleId)
      : r.kind === 'PARKING'
        ? r.spaceId
        : r.portId || 'Đang chờ hệ thống cấp cổng';
  const buttons = [];
  if (r.status === 'HELD') {
    if (r.kind === 'VEHICLE')
      buttons.push(button('Nhận xe', 'pickup', r.id, 'primary small', 'bike'));
    if (r.kind === 'PARKING')
      buttons.push(button('Xác nhận đỗ', 'parking-confirm', r.id, 'primary small', 'parking'));
    if (r.kind === 'CHARGING')
      buttons.push(button('Bắt đầu sạc', 'charge-start', r.id, 'primary small', 'bolt'));
    if (r.kind !== 'CHARGING')
      buttons.push(button('Đổi tài nguyên', 'reservation-change', r.id, 'secondary small'));
    if (r.kind === 'VEHICLE')
      buttons.push(button('Đổi Hub trả', 'destination-change', r.id, 'secondary small'));
  }
  if (active && r.kind !== 'VEHICLE')
    buttons.push(button('Gia hạn', 'reservation-extend', r.id, 'secondary small', 'clock'));
  if (active) buttons.push(button('Hủy đặt chỗ', 'reservation-cancel', r.id, 'ghost small'));
  if (r.status === 'CONFIRMED')
    buttons.push(
      button(
        'Xem phiên sử dụng',
        'go',
        r.kind === 'VEHICLE' ? 'rentals' : 'charging',
        'secondary small',
        'arrow',
      ),
    );
  return `<article class="reservation-card"><div class="row"><div><span class="eyebrow">${esc(label(r.kind))} · ${short(r.id)}</span><h3 style="margin-top:7px">${esc(hubName(r.hubId))}</h3></div>${badge(r.status)}</div><div class="details"><span>Tài nguyên: <strong>${esc(resource)}</strong></span><span>Tạo lúc: <strong>${date(r.createdAt)}</strong></span>${r.kind === 'CHARGING' ? `<span>Mục tiêu: <strong>${r.targetBattery}%</strong></span>` : ''}</div>${r.kind === 'VEHICLE' ? `<p class="destination-note">Trả tại <strong>${esc(hubName(r.plannedReturnHubId))}</strong> · Chỗ ${esc(r.plannedReturnSpaceId)} đã giữ</p>` : ''}${r.waitingReason ? `<p class="waiting-reason">${esc(r.waitingReason)}</p>` : ''}${active ? `<div class="row" style="margin:15px 0">${r.kind === 'VEHICLE' ? `<div><div class="muted small">Mã nhận xe</div><div class="reservation-code">${esc(r.pickupCode)}</div></div>` : ''}${countdown(r)}</div>` : ''}<div class="actions">${buttons.join('')}</div></article>`;
}
function reservationsView() {
  const active = state.reservationTab === 'active';
  const rows = d()
    .reservations.filter((r) =>
      active
        ? ['HELD', 'WAITING', 'CONFIRMED'].includes(r.status)
        : ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(r.status),
    )
    .slice()
    .reverse();
  return (
    heading(
      'Đặt chỗ của tôi',
      'Quản lý xe, vị trí đỗ và cổng sạc đã đặt.',
      button('Đặt chỗ đỗ', 'parking-new', '', 'primary', 'plus'),
    ) +
    `<div class="tabs" role="group" aria-label="Lọc đặt chỗ"><button class="tab ${active ? 'active' : ''}" data-action="reservation-tab" data-id="active">Đang hoạt động</button><button class="tab ${!active ? 'active' : ''}" data-action="reservation-tab" data-id="history">Lịch sử</button></div>${rows.length ? rows.map(reservationCard).join('') : panel('Danh sách đặt chỗ', '', empty(active ? 'Chưa có đặt chỗ đang hoạt động' : 'Chưa có lịch sử đặt chỗ', active ? 'Khám phá Hub để chọn xe hoặc đặt chỗ cho xe cá nhân.' : 'Các đặt chỗ hoàn tất, đã hủy hoặc hết hạn sẽ hiển thị tại đây.', active ? button('Tìm Hub', 'go', 'hubs', 'primary', 'pin') : ''))}`
  );
}
function rentalTable(rows) {
  if (!rows.length)
    return empty('Chưa có chuyến đi', 'Nhận một xe đã đặt để bắt đầu chuyến đi đầu tiên.');
  return table(
    ['Phương tiện', 'Hub nhận → trả', 'Thời gian', 'Phí / phạt', 'Trạng thái'],
    rows.map(
      (r) =>
        `<tr><td><span class="table-primary">${esc(vehicleName(r.vehicleId))}</span><span class="sub">${short(r.id)}</span></td><td>${esc(hubName(r.pickupHubId))}<span class="sub">→ ${r.returnHubId ? esc(hubName(r.returnHubId)) : 'Chưa trả xe'}</span></td><td>${date(r.startedAt)}<span class="sub">${r.endedAt ? date(r.endedAt) : 'Đang diễn ra'}</span></td><td>${money(r.fee)}<span class="sub">Phạt: ${money(r.penalty)}</span></td><td>${badge(r.status)}</td></tr>`,
    ),
  );
}
function rentalsView() {
  const active = d().rentals.filter((r) => r.status === 'ACTIVE');
  const history = d()
    .rentals.filter((r) => r.status === 'COMPLETED')
    .slice()
    .reverse();
  return (
    heading('Chuyến đi của tôi', 'Theo dõi chuyến đi và xem lại lịch sử sử dụng xe.') +
    active
      .map(
        (r) =>
          `<section class="panel"><div class="panel-head"><div><h2>${esc(vehicleName(r.vehicleId))}</h2><p>Nhận tại ${esc(hubName(r.pickupHubId))} · ${date(r.startedAt)}</p></div>${badge(r.status)}</div><div class="panel-body"><div class="money-summary">${money(Math.max(1, Math.ceil((d().serverNow - r.startedAt) / 60000)) * d().policy.pricePerMinute)}<small>Phí sử dụng tạm tính · ${money(d().policy.pricePerMinute)}/phút</small></div><p class="muted small" style="margin-bottom:18px">Hub trả đã đăng ký: <strong>${esc(hubName(r.plannedReturnHubId))}</strong> · Chỗ ${esc(r.plannedReturnSpaceId)} được giữ cho bạn. Trả sai Hub đăng ký có khoản phạt ${money(d().policy.wrongHubPenalty)}.</p><div class="actions">${button('Trả xe tại Hub', 'rental-return', r.id, 'primary')}${button('Đổi Hub trả', 'destination-change', r.reservationId, 'secondary')}</div></div></section>`,
      )
      .join('') +
    (!active.length
      ? panel(
          'Chuyến đi hiện tại',
          '',
          empty(
            'Bạn chưa sử dụng xe nào',
            'Chọn xe và xác nhận mã nhận để bắt đầu.',
            button('Tìm xe điện', 'go', 'hubs', 'secondary', 'bike'),
          ),
        )
      : '') +
    panel('Lịch sử chuyến đi', 'Thông tin các phiên đã hoàn tất', rentalTable(history))
  );
}
function vehiclesView() {
  const vehicles = d().vehicles.filter(
    (v) => v.ownership === 'PERSONAL' && v.ownerId === d().user.id,
  );
  const visits = d()
    .parkingVisits.slice()
    .sort((a, b) => b.enteredAt - a.enteredAt);
  const active = vehicles.filter((v) => v.parkingSpaceId).length;
  return (
    heading(
      'Xe cá nhân',
      'Quản lý vị trí đỗ, sạc và xác nhận lấy xe.',
      button('Đặt chỗ đỗ', 'parking-new', '', 'primary'),
    ) +
    `<div class="cards three">${stat('Xe của bạn', vehicles.length, '', 'Đã đăng ký trong hệ thống')}${stat('Đang gửi tại Hub', active, '', 'Chỗ đỗ tiếp tục được giữ khi sạc')}${stat('Đang ngoài Hub', vehicles.length - active, '', 'Có thể đặt chỗ cho lần đến tiếp theo')}</div>` +
    panel(
      'Danh sách phương tiện',
      'Kết thúc sạc và ngắt kết nối trước khi lấy xe',
      table(
        ['Phương tiện', 'Vị trí', 'Pin', 'Thao tác'],
        vehicles.map(
          (v) =>
            `<tr><td><strong>${esc(v.code)}</strong><span class="sub">${esc(label(v.type))}</span></td><td>${v.currentHubId ? esc(hubName(v.currentHubId)) : 'Ngoài Hub'}<span class="sub">${esc(v.parkingSpaceId || 'Chưa có vị trí đỗ')}</span></td><td>${battery(v.batteryLevel)}<span class="sub">${esc(label(v.status))}</span></td><td><div class="actions">${v.parkingSpaceId ? button('Lấy xe', 'parking-checkout', v.id, 'secondary small') + button('Xem sạc', 'go', 'charging', 'ghost small') : button('Đặt chỗ đỗ', 'parking-new', '', 'primary small')}</div></td></tr>`,
        ),
      ),
    ) +
    panel(
      'Lịch sử gửi xe',
      'Mỗi lượt gửi có thời điểm vào và ra',
      visits.length
        ? table(
            ['Xe', 'Hub / vị trí', 'Vào lúc', 'Ra lúc'],
            visits.map(
              (v) =>
                `<tr><td>${esc(vehicleName(v.vehicleId))}</td><td>${esc(hubName(v.hubId))}<span class="sub">${esc(v.spaceId)}</span></td><td>${date(v.enteredAt)}</td><td>${v.exitedAt ? date(v.exitedAt) : '<span class="badge blue">Đang gửi</span>'}</td></tr>`,
            ),
          )
        : empty('Chưa có lịch sử gửi xe', 'Xác nhận đỗ xe để bắt đầu lượt gửi.'),
    )
  );
}
function notificationsView() {
  const rows = d().notifications;
  return (
    heading(
      'Thông báo',
      'Cập nhật về cổng sạc, chuyến đi và phương tiện của bạn.',
      button('Đánh dấu đã đọc', 'notifications-read', '', 'secondary'),
    ) +
    panel(
      'Cập nhật gần đây',
      'Thông báo được giữ trong phiên chạy của hệ thống',
      rows.length
        ? `<div class="notification-list">${rows.map((n) => `<article class="notification-item ${n.readAt ? '' : 'unread'}"><div><h3>${esc(n.title)}</h3><p>${esc(n.message)}</p><time>${date(n.createdAt)}</time></div>${!n.readAt ? button('Đã đọc', 'notification-read', n.id, 'ghost small') : ''}</article>`).join('')}</div>`
        : empty(
            'Chưa có thông báo',
            'Hệ thống sẽ báo khi được cấp cổng, đạt pin mục tiêu hoặc hoàn tất dịch vụ.',
          ),
    )
  );
}
function chargingView() {
  const sessions = d().chargingSessions;
  const live = sessions.filter((c) => ['ACTIVE', 'AWAITING_DISCONNECT'].includes(c.status));
  const queue = d()
    .reservations.filter((r) => r.kind === 'CHARGING' && ['WAITING', 'HELD'].includes(r.status))
    .sort(
      (a, b) =>
        (a.requiredBy ?? Infinity) - (b.requiredBy ?? Infinity) ||
        (find('vehicles', a.vehicleId)?.batteryLevel ?? 100) -
          (find('vehicles', b.vehicleId)?.batteryLevel ?? 100) ||
        a.createdAt - b.createdAt,
    );
  const completed = sessions
    .filter((c) => ['COMPLETED', 'CANCELLED'].includes(c.status))
    .sort((a, b) => b.endedAt - a.endedAt);
  const operating = role() === 'OPERATOR';
  return (
    heading(
      operating ? 'Điều hành sạc' : 'Sạc xe',
      'Theo dõi yêu cầu, cấp cổng và tiến trình sạc.',
      button(operating ? 'Sạc xe dùng chung' : 'Yêu cầu sạc', 'charge-new', '', 'primary'),
    ) +
    `<div class="cards">${stat('Đang cấp điện', live.filter((c) => c.status === 'ACTIVE').length, '', 'Cập nhật pin theo công suất')}${stat('Đang chờ cổng', queue.filter((r) => r.status === 'WAITING').length, '', 'Phân bổ theo thời điểm cần xe và pin')}${stat('Chờ ngắt kết nối', live.filter((c) => c.status === 'AWAITING_DISCONNECT').length, '', 'Cổng chưa thể cấp cho xe khác')}${stat('Đã kết thúc', completed.length, '', 'Bao gồm hoàn tất và dừng trước mục tiêu')}</div>` +
    (operating
      ? panel(
          'Nguồn lực sạc',
          'Cổng trống còn cần đủ ngân sách công suất',
          table(
            ['Hub', 'Cổng trống', 'Công suất cam kết / giới hạn'],
            d().hubs.map(
              (h) =>
                `<tr><td>${esc(h.name)}</td><td>${h.freePorts}</td><td>${Number(h.chargingUsedKw).toFixed(1)} / ${h.chargingBudgetKw} kW</td></tr>`,
            ),
          ),
        )
      : '') +
    panel(
      'Phiên đang phục vụ',
      'Đạt mục tiêu hoặc dừng sạc → xác nhận ngắt kết nối → giải phóng cổng',
      live.length
        ? table(
            ['Xe / Hub', 'Tiến trình', 'Trạng thái', 'Thao tác'],
            live.map((c) => {
              const v = find('vehicles', c.vehicleId);
              const r = find('reservations', c.reservationId);
              return `<tr><td><strong>${esc(vehicleName(c.vehicleId))}</strong><span class="sub">${esc(hubName(r.hubId))} · ${esc(c.portId)}</span></td><td>${battery(v.batteryLevel, c.targetBattery)}<span class="sub">Bắt đầu ${date(c.startedAt)}</span></td><td>${badge(c.status)}</td><td>${c.status === 'ACTIVE' ? button('Dừng sạc', 'charge-stop', c.id, 'secondary small') : button('Ngắt kết nối', 'charge-disconnect', c.id, 'primary small')}</td></tr>`;
            }),
          )
        : empty('Chưa có phiên đang phục vụ', 'Gửi yêu cầu và bắt đầu sau khi được cấp cổng.'),
    ) +
    panel(
      'Hàng đợi và cổng đã cấp',
      'Ưu tiên thời điểm cần xe sớm hơn → pin thấp hơn → yêu cầu đến trước',
      queue.length
        ? table(
            ['Thứ tự', 'Xe / Hub', 'Cần xe trước', 'Trạng thái / lý do', 'Thao tác'],
            queue.map(
              (r, i) =>
                `<tr><td>${i + 1}</td><td><strong>${esc(vehicleName(r.vehicleId))}</strong><span class="sub">${esc(hubName(r.hubId))} · ${Math.round(find('vehicles', r.vehicleId)?.batteryLevel ?? 0)}%</span></td><td>${r.requiredBy ? date(r.requiredBy) : 'Không khai báo'}</td><td>${badge(r.status)}<span class="sub">${esc(r.waitingReason || r.portId || '')}${r.status === 'HELD' ? ` · ${countdown(r)}` : ''}</span></td><td><div class="actions">${r.status === 'HELD' ? button('Bắt đầu sạc', 'charge-start', r.id, 'primary small') : ''}${r.userId === d().user.id ? button('Hủy', 'reservation-cancel', r.id, 'ghost small') : ''}</div></td></tr>`,
            ),
          )
        : empty('Không có yêu cầu chờ', 'Yêu cầu mới sẽ xuất hiện tại đây.'),
    ) +
    panel(
      'Lịch sử sạc',
      'Cổng chỉ được giải phóng sau khi xác nhận ngắt kết nối',
      completed.length
        ? table(
            ['Xe / cổng', 'Mục tiêu', 'Kết thúc', 'Kết quả'],
            completed.map(
              (c) =>
                `<tr><td>${esc(vehicleName(c.vehicleId))}<span class="sub">${esc(c.portId)}</span></td><td>${c.targetBattery}%</td><td>${date(c.endedAt)}</td><td>${c.stopReason === 'MANUAL' ? 'Dừng theo yêu cầu' : 'Đạt mục tiêu'}</td></tr>`,
            ),
          )
        : empty('Chưa có phiên kết thúc', 'Các phiên đã ngắt kết nối sẽ được hiển thị tại đây.'),
    )
  );
}

function incidentTable(rows) {
  if (!rows.length)
    return empty(
      'Không có sự cố trong danh sách',
      'Những báo cáo phù hợp bộ lọc sẽ hiển thị ở đây.',
    );
  return table(
    ['Tài nguyên / mô tả', 'Báo lúc', 'Người xử lý', 'Trạng thái', 'Thao tác'],
    rows.map(
      (i) =>
        `<tr><td class="task-note"><span class="table-primary">${i.target.kind === 'VEHICLE' ? esc(vehicleName(i.target.id)) : esc(i.target.id)}</span><span class="sub">${esc(i.description.slice(0, 110))}</span></td><td>${date(i.createdAt)}</td><td>${esc(techName(i.technicianId))}</td><td>${badge(i.status)}</td><td><div class="actions">${button('Chi tiết', 'incident-detail', i.id, 'secondary small')}${role() === 'TECHNICIAN' && i.status === 'OPEN' ? button('Nhận xử lý', 'incident-accept', i.id, 'primary small') : ''}${role() === 'TECHNICIAN' && i.status === 'ASSIGNED' && i.technicianId === d().user.id ? button('Hoàn tất', 'incident-resolve', i.id, 'primary small') : ''}</div></td></tr>`,
    ),
  );
}
function incidentsView() {
  const rows = d().incidents.filter(
    (i) => !state.incidentStatus || i.status === state.incidentStatus,
  );
  return (
    heading(
      role() === 'CUSTOMER' ? 'Báo cáo sự cố' : 'Theo dõi & xử lý sự cố',
      'Ghi nhận và phối hợp xử lý vấn đề của xe, cổng sạc.',
      button('Báo cáo sự cố', 'incident-new', '', 'primary', 'plus'),
    ) +
    `<div class="toolbar">${select('incidentStatus', option('', 'Tất cả trạng thái', state.incidentStatus) + ['OPEN', 'ASSIGNED', 'RESOLVED'].map((v) => option(v, label(v), state.incidentStatus)).join(''), 'id="incident-filter" aria-label="Trạng thái sự cố"')}<span class="muted small">${rows.length} báo cáo</span></div>${panel('Danh sách sự cố', role() === 'CUSTOMER' ? 'Những báo cáo do bạn gửi' : 'Thông tin báo cáo và tiến độ xử lý', incidentTable(rows))}`
  );
}
function dispatchTable(rows) {
  if (!rows.length)
    return empty(
      'Chưa có lệnh điều phối',
      'Các kế hoạch chuyển xe giữa Hub sẽ hiển thị tại đây.',
      role() === 'OPERATOR'
        ? button('Tạo lệnh đầu tiên', 'dispatch-new', '', 'secondary', 'plus')
        : '',
    );
  return table(
    ['Mã lệnh / tuyến', 'Xe', 'Người thực hiện', 'Trạng thái', 'Thao tác'],
    rows.map(
      (o) =>
        `<tr><td><span class="table-primary">${short(o.id)}</span><span class="sub">${esc(hubName(o.fromHubId))} → ${esc(hubName(o.toHubId))}</span></td><td>${o.vehicleIds.length} xe<span class="sub">${o.vehicleIds.map(vehicleName).map(esc).join(', ')}</span></td><td>${esc(techName(o.technicianId))}</td><td>${badge(o.status)}</td><td><div class="actions">${button('Chi tiết', 'dispatch-detail', o.id, 'secondary small')}${role() === 'OPERATOR' && o.status === 'PENDING' ? button('Sửa', 'dispatch-edit', o.id, 'secondary small') + button('Hủy', 'dispatch-cancel', o.id, 'ghost small') : ''}${role() === 'TECHNICIAN' && o.status === 'PENDING' ? button('Nhận lệnh', 'dispatch-accept', o.id, 'primary small') : ''}${role() === 'TECHNICIAN' && o.status === 'IN_TRANSIT' && o.technicianId === d().user.id ? button('Bàn giao xe', 'dispatch-complete', o.id, 'primary small') : ''}</div></td></tr>`,
    ),
  );
}
function dispatchView() {
  const rows = d().dispatchOrders.filter(
    (o) => !state.dispatchStatus || o.status === state.dispatchStatus,
  );
  return (
    heading(
      'Điều phối phương tiện',
      role() === 'OPERATOR'
        ? 'Cân bằng số xe giữa các Hub và theo dõi tiến độ thực hiện.'
        : 'Tiếp nhận lệnh và xác nhận bàn giao xe tại Hub đích.',
      role() === 'OPERATOR'
        ? button('Tạo lệnh điều phối', 'dispatch-new', '', 'primary', 'plus')
        : '',
    ) +
    `<div class="toolbar">${select('dispatchStatus', option('', 'Tất cả trạng thái', state.dispatchStatus) + ['PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'].map((v) => option(v, label(v), state.dispatchStatus)).join(''), 'id="dispatch-filter" aria-label="Trạng thái lệnh"')}<span class="small muted">${rows.length} lệnh điều phối</span></div>${panel('Danh sách lệnh', 'Xe nguồn và chỗ tiếp nhận được giữ theo từng lệnh', dispatchTable(rows))}`
  );
}
function scenarioParameter(type, value = 2) {
  if (type === 'HUB_FULL')
    return '<div class="notice">Giả định chuyển xe hợp lệ từ Hub khác để lấp chỗ trống. Số xe toàn mạng lưới được giữ nguyên.</div>';
  const props = ['DEMAND_SURGE', 'CHARGING_SURGE'].includes(type)
    ? ['Hệ số tăng nhu cầu', 1, 3, 0.5]
    : type === 'PORT_FAILURE'
      ? ['Số cổng bị ảnh hưởng', 1, 20, 1]
      : ['Số xe tập trung thêm', 1, 20, 1];
  return field(
    'parameter',
    props[0],
    input(
      'parameter',
      'number',
      value,
      `required min="${props[1]}" max="${props[2]}" step="${props[3]}"`,
    ),
  );
}
function whatIfView() {
  const f = state.scenarioForm || {
    type: 'DEMAND_SURGE',
    targetHubId: 'hub-metro',
    parameter: 2,
    horizonMinutes: 60,
    seed: 42,
  };
  return (
    heading(
      'Phân tích What-if',
      'Khảo sát tác động và kiểm tra phương án điều phối trước khi quyết định.',
    ) +
    `<div class="whatif-layout"><section class="panel scenario-panel"><div class="panel-head"><div><h2>Thiết lập tình huống</h2><p>Dữ liệu mô phỏng theo bước 5 phút</p></div></div><form id="whatif-form" class="panel-body">${field('type', 'Tình huống', select('type', ['DEMAND_SURGE', 'HUB_FULL', 'CHARGING_SURGE', 'PORT_FAILURE', 'VEHICLE_IMBALANCE'].map((v) => option(v, label(v), f.type)).join(''), 'id="scenario-type"'))}${field('targetHubId', 'Hub được khảo sát', select('targetHubId', hubOptions(f.targetHubId)))}<div id="scenario-param">${scenarioParameter(f.type, f.parameter)}</div>${field('horizonMinutes', 'Khoảng khảo sát', select('horizonMinutes', [30, 60, 120].map((v) => option(String(v), `${v} phút`, String(f.horizonMinutes))).join('')))}<details class="model-details"><summary>Thiết lập tái hiện</summary>${field('seed', 'Seed', input('seed', 'number', f.seed, 'required min="0" max="4294967295" step="1"'), 'Cùng trạng thái, tham số và seed cho cùng chỉ số.')}</details><p class="metric-note">Chạy trên bản sao mạng lưới. Kết quả không tự tạo lệnh hoặc thay đổi dữ liệu vận hành.</p><div id="whatif-error" class="form-error" hidden role="alert"></div><button class="btn primary full" type="submit">Chạy mô phỏng</button></form></section><div class="analysis-content">${state.result ? renderResult(state.result) : panel('Kết quả phân tích', 'So sánh điều kiện bình thường, tình huống và phương án thử nghiệm', empty('Chọn tình huống để bắt đầu', 'Hệ thống tính nhu cầu theo thời gian, kiểm tra xe và chỗ tiếp nhận, rồi đánh giá phương án khả thi.'))}</div></div>`
  );
}

function renderResult(r) {
  const c = r.comparison;
  const rows = [
    ['Yêu cầu thuê', 'requestedTrips'],
    ['Lượt được phục vụ', 'servedTrips'],
    ['Lượt chưa phục vụ', 'unservedTrips'],
    ['Bị chặn do thiếu chỗ trả', 'blockedReturns'],
    ['Yêu cầu sạc còn chờ', 'waitingCharges'],
    ['Chờ sạc lớn nhất (phút)', 'maxChargeWaitMinutes'],
    ['Sạc không kịp thời điểm cần xe', 'lateCharges'],
    ['Yêu cầu sạc hết hạn', 'expiredCharges'],
    ['Phiên đạt pin mục tiêu', 'completedCharges'],
  ];
  const last = r.timeline.at(-1);
  return panel(
    'Kết quả phân tích',
    `${label(state.scenarioForm?.type)} · ${hubName(state.scenarioForm?.targetHubId)} · ${r.metrics.horizonMinutes} phút`,
    `<div class="panel-body"><div class="analysis-outcome"><span class="badge ${c.improved ? 'good' : 'blue'}">${c.improved ? 'Phương án cải thiện lượt phục vụ' : 'Cần xem xét tác động'}</span><span class="muted small">${date(r.generatedAt)} · ${r.metrics.totalVehicles} xe trong mô hình</span></div><p class="metric-note">${r.effects.map(esc).join(' ')}</p><div class="result-grid">${stat('Yêu cầu trong tình huống', c.scenario.requestedTrips, '', 'Lượt thuê trong toàn khoảng khảo sát')}${stat('Chưa phục vụ trước / sau', `${c.scenario.unservedTrips} / ${c.coordinated.unservedTrips}`, '', 'Tính từ hai lượt chạy độc lập')}${stat('Phương án được thử', r.actions.length, '', 'Có nguồn, đích và thời điểm cụ thể')}${stat('Sạc trễ mốc cần xe', c.scenario.lateCharges, '', 'Không bảo đảm mọi yêu cầu đều được đáp ứng')}</div></div>` +
      table(
        ['Chỉ số', 'Bình thường', 'Có tình huống', 'Có phương án'],
        rows.map(
          ([name, key]) =>
            `<tr><td>${esc(name)}</td><td>${c.baseline[key]}</td><td>${c.scenario[key]}</td><td>${c.coordinated[key]}</td></tr>`,
        ),
      ) +
      `<div class="panel-body"><h3>Khuyến nghị vận hành</h3><p class="metric-note">Xe điều phối chỉ sẵn sàng sau thời điểm đến. Không tự áp dụng vào hệ thống.</p>${
        r.actions.length
          ? table(
              ['Phương án', 'Số xe', 'Thời điểm'],
              r.actions.map(
                (a) =>
                  `<tr><td><strong>${a.type === 'RELOCATE' ? 'Điều chuyển' : 'Chuyển hướng'}: ${esc(hubName(a.fromHubId))} → ${esc(hubName(a.toHubId))}</strong><span class="sub">${esc(a.reason)}</span></td><td>${a.quantity}</td><td>Phút ${a.departMinute} → ${a.arrivalMinute}</td></tr>`,
              ),
            )
          : ''
      }${r.recommendations
        .filter((t) => !t.startsWith('Chuyển ') && !t.startsWith('Hướng '))
        .map((t) => `<p class="recommendation">${esc(t)}</p>`)
        .join('')}<details class="model-details"><summary>Diễn biến và sức chứa</summary>${table(
        ['Phút', 'Xe sẵn sàng', 'Lượt chưa phục vụ tích lũy', 'Chờ cấp cổng'],
        r.timeline.map(
          (f) =>
            `<tr><td>${f.minute}</td><td>${f.availableVehicles}</td><td>${f.unservedTrips}</td><td>${f.waitingCharges}</td></tr>`,
        ),
      )}<h3 style="margin:18px 0 10px">Trạng thái Hub cuối kỳ, chưa áp dụng phương án</h3>${table(
        ['Hub', 'Xe sẵn sàng', 'Đang đỗ + đã giữ / sức chứa', 'Cổng trống / lỗi'],
        last.hubs.map(
          (h) =>
            `<tr><td>${esc(hubName(h.hubId))}</td><td>${h.availableVehicles}</td><td>${h.occupiedSpaces} + ${h.heldSpaces} / ${h.capacity}</td><td>${h.freePorts} / ${h.faultPorts}</td></tr>`,
        ),
      )}</details><details class="model-details"><summary>Giả định và giới hạn mô hình</summary><ul class="assumptions">${r.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details></div>`,
  );
}

function demoView() {
  const resources = [
    ...d().vehicles.map((v) => option('VEHICLE|' + v.id, vehicleName(v.id))),
    ...d().ports.map((p) => option('CHARGING_PORT|' + p.id, p.id)),
  ].join('');
  return (
    heading(
      'Công cụ trình diễn',
      'Điều chỉnh điều kiện mô phỏng để minh họa các luồng nghiệp vụ.',
    ) +
    `<div class="split equal">${panel('Thời gian mô phỏng', 'Theo dõi hết hạn đặt chỗ và tiến trình sạc', `<div class="panel-body"><div class="notice">Thời gian hệ thống: <strong>${new Date(d().serverNow).toLocaleString('vi-VN')}</strong></div><p class="metric-note">Tiến thời gian sẽ kích hoạt hết hạn giữ chỗ, cập nhật pin và phân bổ yêu cầu sạc đang chờ.</p><div class="actions">${button('+1 phút', 'time-advance', '60', 'secondary', 'clock')}${button('+15 phút', 'time-advance', '900', 'secondary')}${button('+1 giờ', 'time-advance', '3600', 'secondary')}</div></div>`)}${panel('Phản hồi thiết bị giả lập', 'Thiết lập kết quả khóa, mở khóa hoặc kiểm tra', `<form id="command-form" class="panel-body">${field('target', 'Tài nguyên', select('target', resources))}<div class="form-grid">${field('command', 'Lệnh', select('command', ['UNLOCK', 'LOCK', 'CHECK'].map((v) => option(v, { UNLOCK: 'Mở khóa', LOCK: 'Khóa', CHECK: 'Kiểm tra' }[v])).join('')))}${field('success', 'Phản hồi', select('success', option('true', 'Thành công') + option('false', 'Thất bại')))}</div><button class="btn primary" type="submit">Lưu phản hồi</button></form>`)}</div>${panel('Bắt đầu lại buổi demo', 'Khôi phục dữ liệu mẫu ban đầu', `<div class="panel-body"><p class="muted small" style="margin-bottom:17px">Toàn bộ thay đổi và phiên đăng nhập sẽ được đặt lại. Các tài khoản mẫu vẫn dùng mật khẩu Demo@12345.</p>${button('Đặt lại dữ liệu demo', 'reset-demo', '', 'danger', 'refresh')}</div>`)}`
  );
}
function profileView() {
  const u = d().user;
  return (
    heading('Hồ sơ cá nhân', 'Thông tin tài khoản và liên hệ của bạn.') +
    `<div class="profile-wrap">${panel('Thông tin cá nhân', 'Quản lý họ tên, email và số điện thoại', `<form id="profile-form" class="panel-body"><div class="profile-heading"><span class="avatar">${esc(initials(u.fullName))}</span><div><h3>${esc(u.fullName)}</h3><span class="muted small">${esc(label(u.role))}</span></div></div>${field('fullName', 'Họ và tên', input('fullName', 'text', u.fullName, 'required maxlength="80" autocomplete="name"'))}<div class="form-grid">${field('email', 'Email', input('email', 'email', u.email || '', 'maxlength="200" autocomplete="email"'))}${field('phone', 'Số điện thoại', input('phone', 'tel', u.phone || '', 'pattern="[+]?[0-9]{9,15}" autocomplete="tel"'))}</div><div id="profile-error" class="form-error" role="alert" hidden></div><button class="btn primary" type="submit">Lưu thay đổi</button></form>`)}</div>`
  );
}
function render() {
  if (!d()) return;
  shell();
  const views = {
    overview,
    hubs: hubsView,
    reservations: reservationsView,
    rentals: rentalsView,
    charging: chargingView,
    vehicles: vehiclesView,
    notifications: notificationsView,
    incidents: incidentsView,
    dispatch: dispatchView,
    'what-if': whatIfView,
    demo: demoView,
    profile: profileView,
  };
  document.title = `${titleOf(page())} — E-Mobility Hub`;
  document.querySelector('#main').innerHTML =
    views[page()]() +
    `<footer class="footer"><span><b>Smart E-Mobility Hub</b> · Khu đô thị ĐHQG-HCM</span><span>Scout Regiment · CO3001</span></footer>`;
  bindForms();
  updateTimers();
}
function updateTimers() {
  if (!d()) return;
  const now = d().serverNow + (Date.now() - (state.loadedAt || Date.now()));
  document.querySelectorAll('[data-expires]').forEach((n) => {
    const left = Math.max(0, Math.ceil((Number(n.dataset.expires) - now) / 1000));
    n.textContent = left
      ? `Còn ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
      : 'Đang cập nhật trạng thái…';
  });
}
async function changed(message, view) {
  await load(true);
  state.loadedAt = Date.now();
  if (view) go(view);
  toast(message);
}
function confirm(title, description, action, submit = 'Xác nhận') {
  modal(title, `<p class="muted" style="line-height:1.9">${esc(description)}</p>`, action, submit);
}
const hubOptions = (selected) =>
  d()
    .hubs.filter((h) => h.status === 'ACTIVE')
    .map((h) => option(h.id, h.name, selected))
    .join('');
function bindHubSpaces(form, hubId, spaceName = 'spaceId') {
  const node = form.elements[spaceName];
  const spaces = d().spaces.filter((p) => p.hubId === hubId && p.status === 'FREE');
  node.innerHTML = spaces.length
    ? spaces.map((p) => option(p.id, 'Chỗ ' + p.id.split('-').at(-1).toUpperCase())).join('')
    : option('', 'Hub đã hết chỗ trống');
  node.disabled = !spaces.length;
}
async function hubDetail(id) {
  const h = await api('/hubs/' + encodeURIComponent(id));
  modal(
    h.name,
    `<div class="modal-summary"><div>${badge(h.status)}<p class="muted small" style="margin-top:5px">Giờ hoạt động: ${esc(h.openingHours)} · ${h.freeSpaces} chỗ trống · ${h.freePorts} cổng sạc</p></div></div><h3 style="margin-bottom:12px">Xe dùng chung tại Hub</h3>${
      h.vehicles.length
        ? table(
            ['Phương tiện', 'Pin', 'Trạng thái', ''],
            h.vehicles.map(
              (v) =>
                `<tr><td><span class="table-primary">${esc(v.code)}</span><span class="sub">${esc(label(v.type))}</span></td><td>${battery(v.batteryLevel)}</td><td>${v.status === 'AVAILABLE' && !v.rentable ? `<span class="badge muted">${v.batteryLevel < d().policy.minBattery ? 'Pin thấp' : 'Đang chờ sạc'}</span>` : badge(v.status)}</td><td>${role() === 'CUSTOMER' && v.rentable ? button('Giữ xe', 'reserve-vehicle', v.id, 'primary small') : ''}</td></tr>`,
            ),
          )
        : empty('Chưa có xe tại Hub', 'Bạn có thể chọn Hub khác.')
    }<h3 style="margin:22px 0 12px">Chỗ đỗ</h3><div class="space-grid">${h.spaces.map((p) => `<div class="space-cell ${p.status === 'FREE' ? 'free' : ''}"><strong>${esc(p.id.split('-').at(-1).toUpperCase())}</strong><br>${esc(label(p.status))}</div>`).join('')}</div><h3 style="margin:22px 0 12px">Cổng sạc</h3>${h.ports.map((p) => `<div class="list-row"><div class="list-title"><div><p>${esc(p.id)}</p><small>${p.powerKw} kW</small></div></div>${badge(p.status)}</div>`).join('')}`,
  );
}
function parkingForm() {
  const vehicles = d().vehicles.filter(
    (v) => v.ownership === 'PERSONAL' && v.ownerId === d().user.id && !v.parkingSpaceId,
  );
  if (!vehicles.length)
    return modal(
      'Đặt chỗ cho xe cá nhân',
      empty(
        'Không có xe cần chỗ đỗ',
        'Xe cá nhân của bạn đã có vị trí đỗ hoặc chưa có trong dữ liệu demo.',
      ),
    );
  modal(
    'Đặt chỗ đỗ',
    field(
      'vehicleId',
      'Xe cá nhân',
      select('vehicleId', vehicles.map((v) => option(v.id, v.code)).join('')),
    ) +
      field('hubId', 'Hub muốn đỗ', select('hubId', hubOptions())) +
      field('spaceId', 'Vị trí đỗ', select('spaceId', '')) +
      `<div class="notice">Giữ chỗ ${d().policy.holdMinutes} phút. Khi xe vào bãi, hãy xác nhận đỗ trong mục Đặt chỗ của tôi.</div>`,
    async (data) => {
      await api('/reservations/parking', { method: 'POST', body: data });
      await changed('Đã giữ chỗ đỗ cho bạn.', 'reservations');
    },
    'Giữ chỗ đỗ',
  );
  const form = document.querySelector('#dialog-form');
  bindHubSpaces(form, form.elements.hubId.value);
  form.elements.hubId.onchange = () => bindHubSpaces(form, form.elements.hubId.value);
}
function chargeForm() {
  const operating = role() === 'OPERATOR';
  const vehicles = d().vehicles.filter(
    (v) =>
      (operating
        ? v.ownership === 'SHARED'
        : v.ownership === 'PERSONAL' && v.ownerId === d().user.id) &&
      v.currentHubId &&
      v.parkingSpaceId &&
      v.status === 'AVAILABLE' &&
      v.batteryLevel < 100 &&
      !d().reservations.some((r) => r.vehicleId === v.id && ['WAITING', 'HELD'].includes(r.status)),
  );
  if (!vehicles.length)
    return modal(
      'Yêu cầu sạc',
      empty(
        'Chưa có xe phù hợp',
        'Xe cần đang đỗ tại Hub, chưa có yêu cầu sạc và không bị chiếm dụng.',
      ),
    );
  modal(
    operating ? 'Sạc xe dùng chung' : 'Yêu cầu sạc',
    field(
      'vehicleId',
      'Xe cần sạc',
      select(
        'vehicleId',
        vehicles
          .map((v) =>
            option(v.id, `${v.code} · ${Math.round(v.batteryLevel)}% · ${hubName(v.currentHubId)}`),
          )
          .join(''),
      ),
    ) +
      `<div id="charge-hub" class="notice"></div>` +
      field(
        'targetBattery',
        'Mức pin mục tiêu (%)',
        input('targetBattery', 'number', 80, 'required min="1" max="100" step="1"'),
      ) +
      field(
        'requiredBy',
        'Thời điểm cần xe (tùy chọn)',
        input('requiredBy', 'datetime-local'),
        'Dùng để xếp ưu tiên; không bảo đảm sạc xong đúng thời điểm này.',
      ) +
      '<p class="small muted">Cổng được phân bổ tự động theo hàng đợi và công suất. Bạn sẽ nhận thông báo khi đến lượt.</p>',
    async (data) => {
      const v = vehicles.find((v) => v.id === data.vehicleId);
      await api('/charging/requests', {
        method: 'POST',
        body: {
          vehicleId: v.id,
          hubId: v.currentHubId,
          targetBattery: Number(data.targetBattery),
          requiredBy: data.requiredBy ? new Date(data.requiredBy).getTime() : undefined,
        },
      });
      await changed('Đã tiếp nhận yêu cầu sạc.', 'charging');
    },
    'Gửi yêu cầu',
  );
  const form = document.querySelector('#dialog-form');
  const update = () => {
    const v = vehicles.find((v) => v.id === form.elements.vehicleId.value);
    document.querySelector('#charge-hub').textContent =
      `Xe đang đỗ tại ${hubName(v.currentHubId)}. Pin hiện tại ${Math.round(v.batteryLevel)}%.`;
    form.elements.targetBattery.min = Math.floor(v.batteryLevel) + 1;
    form.elements.targetBattery.value = Math.min(100, Math.max(80, Math.ceil(v.batteryLevel) + 1));
  };
  update();
  form.elements.vehicleId.onchange = update;
}

function dispatchForm(order) {
  modal(
    order ? 'Chỉnh sửa lệnh điều phối' : 'Tạo lệnh điều phối',
    `<div class="form-grid">${field('fromHubId', 'Hub nguồn', select('fromHubId', hubOptions(order?.fromHubId)))}${field('toHubId', 'Hub đích', select('toHubId', hubOptions(order?.toHubId || 'hub-b')))}</div>` +
      field(
        'quantity',
        'Số xe dùng chung',
        input(
          'quantity',
          'number',
          order?.vehicleIds.length || 1,
          'required min="1" max="50" step="1"',
        ),
      ) +
      '<div class="notice">Hệ thống sẽ chọn xe khả dụng tại nguồn và giữ đủ chỗ nhận tại Hub đích.</div>',
    async (data) => {
      await api('/dispatch' + (order ? '/' + order.id : ''), {
        method: order ? 'PATCH' : 'POST',
        body: { ...data, quantity: Number(data.quantity) },
      });
      await changed(order ? 'Đã cập nhật lệnh.' : 'Đã tạo lệnh điều phối.', 'dispatch');
    },
    order ? 'Lưu thay đổi' : 'Tạo lệnh',
  );
}
function incidentForm() {
  modal(
    'Báo cáo sự cố',
    field(
      'kind',
      'Loại tài nguyên',
      select('kind', option('VEHICLE', 'Phương tiện') + option('CHARGING_PORT', 'Cổng sạc')),
    ) +
      field('targetId', 'Tài nguyên', select('targetId', '')) +
      field(
        'description',
        'Mô tả sự cố',
        '<textarea name="description" required maxlength="2000" placeholder="Mô tả vấn đề bạn gặp phải…"></textarea>',
      ),
    async (data) => {
      await api('/incidents', {
        method: 'POST',
        body: { target: { kind: data.kind, id: data.targetId }, description: data.description },
      });
      await changed('Báo cáo đã được gửi tới đội kỹ thuật.', 'incidents');
    },
    'Gửi báo cáo',
  );
  const form = document.querySelector('#dialog-form');
  const update = () => {
    form.elements.targetId.innerHTML = (
      form.elements.kind.value === 'VEHICLE'
        ? d().vehicles.map((v) => option(v.id, `${v.code} · ${hubName(v.currentHubId)}`))
        : d().ports.map((p) => option(p.id, `${p.id} · ${hubName(p.hubId)}`))
    ).join('');
  };
  update();
  form.elements.kind.onchange = update;
}
function reserveVehicleForm(id) {
  const v = find('vehicles', id);
  const hubs = d().hubs.filter((h) => h.status === 'ACTIVE' && h.freeSpaces > 0);
  if (!hubs.length)
    return modal(
      'Đặt xe',
      empty('Chưa có Hub nhận trả phù hợp', 'Hãy thử lại khi có chỗ tiếp nhận.'),
    );
  const selected = hubs.find((h) => h.id !== v.currentHubId)?.id || hubs[0].id;
  modal(
    'Đặt xe cho hành trình',
    `<div class="modal-summary"><div><h3>${esc(v.code)}</h3><p class="muted">Nhận tại ${esc(hubName(v.currentHubId))} · Pin ${Math.round(v.batteryLevel)}%</p></div></div>` +
      field(
        'returnHubId',
        'Hub trả xe',
        select(
          'returnHubId',
          hubs.map((h) => option(h.id, `${h.name} · ${h.freeSpaces} chỗ trống`, selected)).join(''),
        ),
      ) +
      `<div class="notice">Xe được giữ ${d().policy.holdMinutes} phút để đến nhận. Một chỗ trả được giữ ở Hub đích cho đến khi kết thúc chuyến đi.</div><p class="small muted">Phí thuê ${money(d().policy.pricePerMinute)}/phút. Trả đúng Hub đăng ký không bị phạt. Bạn có thể đổi Hub trả khi đích mới còn chỗ.</p>`,
    async (f) => {
      await api('/reservations/vehicle', {
        method: 'POST',
        body: { vehicleId: id, returnHubId: f.returnHubId },
      });
      await changed('Đã giữ xe và chỗ trả tại Hub đích.', 'reservations');
    },
    'Giữ xe 15 phút',
  );
}
function destinationForm(reservationId) {
  const r = find('reservations', reservationId);
  const hubs = d().hubs.filter(
    (h) => h.status === 'ACTIVE' && (h.freeSpaces > 0 || h.id === r.plannedReturnHubId),
  );
  modal(
    'Đổi Hub trả',
    field(
      'hubId',
      'Hub trả mới',
      select(
        'hubId',
        hubs
          .map((h) => option(h.id, `${h.name} · ${h.freeSpaces} chỗ trống`, r.plannedReturnHubId))
          .join(''),
      ),
    ) +
      '<div class="notice">Hệ thống giữ chỗ mới trước khi giải phóng chỗ cũ. Đổi thành công thì Hub mới trở thành nơi trả hợp lệ.</div>',
    async (f) => {
      await api('/reservations/' + reservationId + '/destination', { method: 'POST', body: f });
      await changed('Đã cập nhật Hub trả và chỗ tiếp nhận.');
    },
    'Xác nhận đổi',
  );
}
function returnForm(r) {
  modal(
    'Xác nhận trả xe',
    `<div class="modal-summary"><div><h3>${esc(vehicleName(r.vehicleId))}</h3><p class="muted">Nơi trả đã đăng ký: ${esc(hubName(r.plannedReturnHubId))}</p></div></div>` +
      field('hubId', 'Hub đang trả xe', select('hubId', hubOptions(r.plannedReturnHubId))) +
      field('spaceId', 'Vị trí đỗ', select('spaceId', '')) +
      '<div id="return-policy" class="notice"></div><label class="checkbox"><input type="checkbox" name="arrived" required>Tôi xác nhận xe đã đến Hub và vào đúng vị trí được chọn.</label><p class="small muted">Trong môi trường demo, xác nhận đến nơi cung cấp sự kiện vị trí mô phỏng.</p>',
    async (f) => {
      await api('/demo/telemetry', {
        method: 'POST',
        body: { vehicleId: r.vehicleId, hubId: f.hubId },
      });
      const result = await api('/rentals/' + r.id + '/return', {
        method: 'POST',
        body: { hubId: f.hubId, spaceId: f.spaceId },
      });
      await changed(
        `Đã trả xe. Phí sử dụng ${money(result.fee)}, phạt ${money(result.penalty)}.`,
        'rentals',
      );
    },
    'Xác nhận trả xe',
  );
  const form = document.querySelector('#dialog-form');
  const update = () => {
    const hubId = form.elements.hubId.value;
    const spaces = d().spaces.filter(
      (p) =>
        p.hubId === hubId &&
        (p.status === 'FREE' || (p.id === r.plannedReturnSpaceId && p.status === 'HELD')),
    );
    form.elements.spaceId.innerHTML = spaces.length
      ? spaces
          .map((p) =>
            option(
              p.id,
              p.id + (p.id === r.plannedReturnSpaceId ? ' · Đã giữ cho bạn' : ''),
              r.plannedReturnSpaceId,
            ),
          )
          .join('')
      : option('', 'Không còn chỗ tiếp nhận');
    form.elements.spaceId.disabled = !spaces.length;
    document.querySelector('#return-policy').textContent =
      hubId === r.plannedReturnHubId
        ? 'Trả đúng Hub đăng ký. Không phát sinh phạt trả sai Hub.'
        : `Bạn đang trả khác Hub đã đăng ký. Khoản phạt dự kiến ${money(d().policy.wrongHubPenalty)}. Có thể quay lại đổi Hub trả trước khi xác nhận.`;
  };
  update();
  form.elements.hubId.onchange = update;
}

function bindForms() {
  document.querySelector('#hub-search')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.target));
    const q = new URLSearchParams();
    for (const k of ['area', 'vehicleType', 'minBattery']) if (form[k]) q.set(k, form[k]);
    if (form.needs === 'parking') q.set('needsParking', 'true');
    if (form.needs === 'charging') q.set('needsCharging', 'true');
    const submit = e.target.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      state.hubQuery = q.toString();
      state.hubResults = await api('/hubs?' + state.hubQuery);
      render();
    } catch (err) {
      toast(err.message, true);
    } finally {
      submit.disabled = false;
    }
  });
  document.querySelector('#incident-filter')?.addEventListener('change', (e) => {
    state.incidentStatus = e.target.value;
    render();
  });
  document.querySelector('#dispatch-filter')?.addEventListener('change', (e) => {
    state.dispatchStatus = e.target.value;
    render();
  });
  document.querySelector('#scenario-type')?.addEventListener('change', (e) => {
    const type = e.target.value;
    const form = document.querySelector('#whatif-form');
    const value = type === 'PORT_FAILURE' ? 1 : type === 'VEHICLE_IMBALANCE' ? 3 : 2;
    document.querySelector('#scenario-param').innerHTML = scenarioParameter(type, value);
    form.elements.targetHubId.value = type === 'DEMAND_SURGE' ? 'hub-metro' : 'hub-a';
  });
  document.querySelector('#whatif-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const key = ['DEMAND_SURGE', 'CHARGING_SURGE'].includes(f.type)
      ? 'multiplier'
      : f.type === 'PORT_FAILURE'
        ? 'failedPorts'
        : 'additionalVehicles';
    const submit = e.target.querySelector('[type=submit]');
    submit.disabled = true;
    const error = document.querySelector('#whatif-error');
    error.hidden = true;
    try {
      state.scenarioForm = { ...f };
      state.result = await api('/what-if', {
        method: 'POST',
        body: {
          type: f.type,
          targetHubId: f.targetHubId,
          parameters: f.type === 'HUB_FULL' ? {} : { [key]: Number(f.parameter) },
          horizonMinutes: Number(f.horizonMinutes),
          seed: Number(f.seed),
        },
      });
      render();
      toast('Mô phỏng hoàn tất.');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
  document.querySelector('#profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = e.target.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      await api('/me', { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) });
      await changed('Đã lưu thông tin cá nhân.');
    } catch (err) {
      const n = document.querySelector('#profile-error');
      n.textContent = err.message;
      n.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
  document.querySelector('#command-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const [kind, id] = f.target.split('|');
    try {
      await api('/demo/command', {
        method: 'POST',
        body: { target: { kind, id }, command: f.command, success: f.success === 'true' },
      });
      toast('Đã lưu phản hồi giả lập.');
    } catch (err) {
      toast(err.message, true);
    }
  });
}
const handlers = {
  go: (id) => {
    document.querySelector('#dialog').close();
    go(id);
  },
  menu: () => document.body.classList.toggle('sidebar-open'),
  'menu-close': () => document.body.classList.remove('sidebar-open'),
  refresh: () => changed('Dữ liệu đã được cập nhật.'),
  logout: () =>
    confirm(
      'Đăng xuất',
      'Bạn muốn kết thúc phiên làm việc này?',
      async () => {
        await api('/auth/logout', { method: 'POST', body: {} });
        location.replace('/pages/auth/login.html');
      },
      'Đăng xuất',
    ),
  'hub-detail': hubDetail,
  'clear-hubs': () => {
    state.hubQuery = '';
    state.hubResults = null;
    render();
  },
  'reserve-vehicle': reserveVehicleForm,
  'destination-change': destinationForm,
  'parking-new': parkingForm,
  'charge-new': chargeForm,
  'reservation-tab': (id) => {
    state.reservationTab = id;
    render();
  },
  'reservation-cancel': (id) =>
    confirm(
      'Hủy đặt chỗ',
      'Tài nguyên đang giữ sẽ được giải phóng nếu bản đặt còn được phép hủy.',
      async () => {
        await api('/reservations/' + id, { method: 'DELETE' });
        await changed('Đã hủy đặt chỗ.');
      },
      'Hủy đặt chỗ',
    ),
  'reservation-extend': (id) =>
    modal(
      'Gia hạn giữ chỗ',
      field(
        'extraMinutes',
        'Gia hạn thêm (phút)',
        input(
          'extraMinutes',
          'number',
          5,
          `required min="1" max="${d().policy.maxExtensionMinutes}"`,
        ),
      ) +
        `<p class="muted small">Tối đa ${d().policy.maxExtensions} lần, mỗi lần tối đa ${d().policy.maxExtensionMinutes} phút.</p>`,
      async (f) => {
        await api('/reservations/' + id + '/extend', {
          method: 'POST',
          body: { extraMinutes: Number(f.extraMinutes) },
        });
        await changed('Đã gia hạn giữ chỗ.');
      },
      'Gia hạn',
    ),
  'reservation-change': (id) => {
    const r = find('reservations', id);
    const items =
      r.kind === 'VEHICLE'
        ? d()
            .vehicles.filter((v) => v.currentHubId === r.hubId && v.rentable)
            .map((v) => [v.id, `${v.code} · ${Math.round(v.batteryLevel)}%`])
        : r.kind === 'PARKING'
          ? d()
              .spaces.filter((p) => p.hubId === r.hubId && p.status === 'FREE')
              .map((p) => [p.id, p.id])
          : d()
              .ports.filter((p) => p.hubId === r.hubId && p.status === 'FREE')
              .map((p) => [p.id, `${p.id} · ${p.powerKw} kW`]);
    if (!items.length)
      return modal(
        'Đổi tài nguyên',
        empty(
          'Chưa có tài nguyên thay thế',
          'Hiện không có tài nguyên phù hợp còn trống trong cùng Hub.',
        ),
      );
    modal(
      'Đổi tài nguyên',
      field(
        'newResourceId',
        'Tài nguyên mới',
        select('newResourceId', items.map(([v, t]) => option(v, t)).join('')),
      ) + '<div class="notice">Thời hạn giữ chỗ hiện tại được giữ nguyên.</div>',
      async (f) => {
        await api('/reservations/' + id + '/resource', { method: 'POST', body: f });
        await changed('Đã đổi tài nguyên.');
      },
      'Xác nhận đổi',
    );
  },
  pickup: (id) => {
    const r = find('reservations', id);
    modal(
      'Nhận xe đã đặt',
      `<div class="notice">${esc(vehicleName(r.vehicleId))} tại ${esc(hubName(r.hubId))}</div>` +
        field(
          'code',
          'Mã nhận xe',
          input(
            'code',
            'text',
            '',
            'required maxlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="Nhập mã 6 chữ số"',
          ),
        ),
      async (f) => {
        await api('/rentals/pickup', { method: 'POST', body: { reservationId: id, code: f.code } });
        await changed('Đã nhận xe. Chỗ trả tại Hub đăng ký tiếp tục được giữ.', 'rentals');
      },
      'Xác nhận nhận xe',
    );
  },
  'parking-confirm': (id) =>
    confirm(
      'Xác nhận xe đã vào chỗ',
      'Xác nhận xe cá nhân của bạn đã vào đúng vị trí được giữ tại Hub.',
      async () => {
        await api('/reservations/' + id + '/confirm-parking', { method: 'POST', body: {} });
        await changed('Đã ghi nhận xe vào chỗ đỗ.', 'vehicles');
      },
      'Xe đã vào chỗ',
    ),
  'charge-start': (id) =>
    confirm(
      'Bắt đầu phiên sạc',
      'Xác nhận xe đã ở Hub và sử dụng đúng cổng được giữ. Phiên sạc bắt đầu sau khi kiểm tra hợp lệ.',
      async () => {
        await api('/charging/' + id + '/start', { method: 'POST', body: {} });
        await changed('Phiên sạc đã bắt đầu.', 'charging');
      },
      'Bắt đầu sạc',
    ),
  'rental-return': (id) => returnForm(find('rentals', id)),
  'parking-checkout': (id) =>
    confirm(
      'Xác nhận lấy xe',
      `Xe ${vehicleName(id)} sẽ rời Hub và giải phóng chỗ đỗ. Hãy kết thúc sạc, ngắt kết nối hoặc hủy yêu cầu chờ trước khi lấy xe.`,
      async () => {
        await api('/vehicles/' + id + '/checkout', { method: 'POST', body: {} });
        await changed('Đã kết thúc gửi xe.', 'vehicles');
      },
      'Xác nhận lấy xe',
    ),
  'charge-stop': (id) =>
    confirm(
      'Dừng sạc',
      'Dừng cấp điện ở mức pin hiện tại. Sau đó cần xác nhận ngắt kết nối để giải phóng cổng.',
      async () => {
        await api('/charging/' + id + '/stop', { method: 'POST', body: {} });
        await changed('Đã dừng sạc. Hãy ngắt kết nối.', 'charging');
      },
      'Dừng sạc',
    ),
  'charge-disconnect': (id) =>
    confirm(
      'Ngắt kết nối sạc',
      'Xác nhận đã tháo đầu sạc khỏi xe. Cổng được giải phóng và hàng đợi sẽ được phân bổ lại.',
      async () => {
        await api('/charging/' + id + '/disconnect', { method: 'POST', body: {} });
        await changed('Đã ngắt kết nối và giải phóng cổng.', 'charging');
      },
      'Xác nhận ngắt kết nối',
    ),
  'notifications-read': async () => {
    await api('/notifications/read', { method: 'POST', body: {} });
    await changed('Đã đánh dấu thông báo đã đọc.');
  },
  'notification-read': async (id) => {
    await api('/notifications/read', { method: 'POST', body: { id } });
    await load(true);
  },
  'incident-new': incidentForm,
  'incident-detail': (id) => {
    const i = find('incidents', id);
    modal(
      'Chi tiết sự cố',
      `<div class="details"><span>Mã: <strong>${short(i.id)}</strong></span><span>${badge(i.status)}</span></div><div class="notice">${i.target.kind === 'VEHICLE' ? esc(vehicleName(i.target.id)) : esc(i.target.id)}</div><h3>Mô tả báo cáo</h3><p class="muted wrap" style="margin:10px 0 22px;white-space:pre-wrap">${esc(i.description)}</p><p class="small muted">Người xử lý: ${esc(techName(i.technicianId))}</p>${i.resolutionNotes ? `<h3 style="margin-top:20px">Kết quả xử lý</h3><p class="muted wrap" style="margin-top:10px;white-space:pre-wrap">${esc(i.resolutionNotes)}</p>` : ''}`,
    );
  },
  'incident-accept': (id) =>
    confirm(
      'Nhận xử lý sự cố',
      'Bạn sẽ là kỹ thuật viên phụ trách báo cáo này.',
      async () => {
        await api('/incidents/' + id + '/accept', { method: 'POST', body: {} });
        await changed('Đã nhận xử lý sự cố.');
      },
      'Nhận xử lý',
    ),
  'incident-resolve': (id) =>
    modal(
      'Hoàn tất xử lý sự cố',
      field(
        'notes',
        'Ghi chú kết quả',
        '<textarea name="notes" required maxlength="2000" placeholder="Kết quả kiểm tra và xử lý…"></textarea>',
      ) +
        '<div class="notice">Hệ thống kiểm tra phản hồi giả lập trước khi ghi nhận hoàn tất.</div>',
      async (f) => {
        await api('/incidents/' + id + '/resolve', { method: 'POST', body: f });
        await changed('Đã ghi nhận kết quả xử lý sự cố.');
      },
      'Hoàn tất xử lý',
    ),
  'dispatch-new': () => dispatchForm(),
  'dispatch-edit': (id) => dispatchForm(find('dispatchOrders', id)),
  'dispatch-cancel': (id) =>
    confirm(
      'Hủy lệnh điều phối',
      'Xe và chỗ nhận do lệnh này giữ sẽ được giải phóng.',
      async () => {
        await api('/dispatch/' + id, { method: 'DELETE' });
        await changed('Đã hủy lệnh điều phối.');
      },
      'Hủy lệnh',
    ),
  'dispatch-accept': (id) =>
    confirm(
      'Tiếp nhận lệnh điều phối',
      'Xe sẽ bắt đầu vận chuyển, chỗ nhận tại Hub đích tiếp tục được giữ.',
      async () => {
        await api('/dispatch/' + id + '/accept', { method: 'POST', body: {} });
        await changed('Đã nhận lệnh. Bạn có thể vận chuyển xe tới Hub đích.');
      },
      'Nhận lệnh',
    ),
  'dispatch-detail': async (id) => {
    const o = await api('/dispatch/' + id);
    modal(
      'Chi tiết lệnh điều phối',
      `<div class="details"><span>Mã: <strong>${short(o.id)}</strong></span>${badge(o.status)}</div><div class="modal-summary"><strong>${esc(hubName(o.fromHubId))} → ${esc(hubName(o.toHubId))}</strong></div><p class="muted small">Người thực hiện: ${esc(techName(o.technicianId))}</p><h3 style="margin:20px 0 10px">Xe và chỗ tiếp nhận</h3>${table(
        ['Xe', 'Chỗ nhận'],
        o.vehicleIds.map(
          (v, i) =>
            `<tr><td>${esc(vehicleName(v))}</td><td>${esc(o.reservedSpaceIds[i])}</td></tr>`,
        ),
      )}`,
    );
  },
  'dispatch-complete': (id) => {
    const o = find('dispatchOrders', id);
    modal(
      'Bàn giao xe tại Hub đích',
      `<div class="notice">${o.vehicleIds.length} xe · Hub đích: <strong>${esc(hubName(o.toHubId))}</strong></div><label class="checkbox"><input type="checkbox" name="simulate" checked>Tôi xác nhận các xe đã đến Hub đích và sẵn sàng bàn giao (mô phỏng).</label><p class="muted small">Hệ thống xác minh toàn bộ xe và các chỗ tiếp nhận đã giữ trước khi hoàn tất lệnh.</p>`,
      async (f) => {
        if (f.simulate)
          for (const vehicleId of o.vehicleIds)
            await api('/demo/telemetry', { method: 'POST', body: { vehicleId, hubId: o.toHubId } });
        await api('/dispatch/' + id + '/complete', { method: 'POST', body: {} });
        await changed('Đã hoàn tất bàn giao xe tại Hub đích.');
      },
      'Hoàn tất bàn giao',
    );
  },
  'time-advance': (id) =>
    confirm(
      'Tiến thời gian mô phỏng',
      `Tiến thêm ${Number(id) / 60} phút và xử lý các tác vụ theo thời gian. Thao tác ảnh hưởng đến mọi phiên trong buổi demo.`,
      async () => {
        await api('/demo/advance', { method: 'POST', body: { seconds: Number(id) } });
        await changed('Đã cập nhật thời gian mô phỏng.');
      },
      'Tiến thời gian',
    ),
  'reset-demo': () =>
    confirm(
      'Đặt lại buổi demo',
      'Toàn bộ thay đổi và phiên đăng nhập hiện tại sẽ bị xóa. Dữ liệu mẫu ban đầu được nạp lại.',
      async () => {
        await api('/demo/reset', { method: 'POST', body: {} });
        location.replace('/pages/auth/login.html');
      },
      'Đặt lại dữ liệu',
    ),
};
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const fn = handlers[b.dataset.action];
  if (!fn) return;
  try {
    if (b.tagName === 'BUTTON') b.disabled = true;
    await fn(b.dataset.id);
  } catch (err) {
    toast(err.message, true);
  } finally {
    if (b.tagName === 'BUTTON') b.disabled = false;
  }
});
window.addEventListener('hashchange', () => {
  document.body.classList.remove('sidebar-open');
  render();
  window.scrollTo({ top: 0 });
});
try {
  await load(true);
  state.loadedAt = Date.now();
} catch (e) {
  if (e.status !== 401)
    document.querySelector('#main').innerHTML = empty(
      'Chưa kết nối được tới hệ thống',
      e.message,
      button('Thử lại', 'refresh', '', 'primary'),
    );
}
setInterval(updateTimers, 1000);
setInterval(async () => {
  if (!d() || busy || document.hidden || document.querySelector('#dialog').open) return;
  busy = true;
  try {
    await load();
    state.loadedAt = Date.now();
  } catch {
  } finally {
    busy = false;
  }
}, 3000);
