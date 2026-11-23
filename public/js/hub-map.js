import { esc, badge, button } from './ui.js';

const shortNames = {
  'hub-metro': 'Metro ĐHQG',
  'hub-a': 'KTX Khu A',
  'hub-b': 'KTX Khu B',
  'hub-bk': 'Bách khoa',
  'hub-library': 'Thư viện',
  'hub-nvh': 'Nhà văn hóa',
};

/** Local schematic from seeded coordinates. No external maps, geolocation or routing service. */
export function renderHubMap(hubs, selectedId, allHubs = hubs) {
  if (!hubs.length) return '';
  const selected = hubs.find((h) => h.id === selectedId) || hubs[0];
  const latitudes = allHubs.map((h) => h.position.lat);
  const longitudes = allHubs.map((h) => h.position.lng);
  const minLat = Math.min(...latitudes),
    maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes),
    maxLng = Math.max(...longitudes);
  const point = (h) => ({
    x: 12 + ((h.position.lng - minLng) / (maxLng - minLng || 1)) * 76,
    y: 15 + ((maxLat - h.position.lat) / (maxLat - minLat || 1)) * 66,
  });
  const number = (h) => allHubs.findIndex((item) => item.id === h.id) + 1;
  const source = point(selected);
  const others = hubs.filter((h) => h.id !== selected.id);
  const lines = others
    .map((h) => {
      const p = point(h);
      return `<line x1="${source.x * 10}" y1="${source.y * 5}" x2="${p.x * 10}" y2="${p.y * 5}" class="${h.status === 'ACTIVE' && selected.status === 'ACTIVE' ? '' : 'inactive'}"/>`;
    })
    .join('');
  return `<section class="panel hub-map-panel" aria-label="Bản đồ mô phỏng các Hub"><div class="panel-head"><div><h2>Bản đồ mô phỏng mạng lưới Hub</h2><p>Chọn một Hub để xem tài nguyên và thời gian di chuyển tới các Hub khác.</p></div><span class="badge blue">${hubs.length}/${allHubs.length} Hub</span></div>
  <div class="hub-map-layout"><div class="hub-map-canvas"><svg viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="hub-map-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#dce6f1" stroke-width="1"/></pattern></defs><rect width="1000" height="500" fill="url(#hub-map-grid)"/><g class="hub-map-links">${lines}</g></svg><span class="map-north" aria-hidden="true">Bắc ↑</span>${hubs
    .map((h) => {
      const p = point(h);
      return `<button type="button" class="hub-map-pin ${h.id === selected.id ? 'is-selected' : ''} ${h.status !== 'ACTIVE' ? 'is-inactive' : ''}" style="left:${p.x}%;top:${p.y}%" data-action="hub-map-select" data-id="${esc(h.id)}" aria-pressed="${h.id === selected.id}" aria-label="Chọn ${esc(h.name)}"><span class="hub-pin-number">${number(h)}</span><span class="hub-pin-name">${esc(shortNames[h.id] || h.name)}</span></button>`;
    })
    .join('')}</div>
  <aside class="hub-map-sidebar"><div class="hub-map-selected" aria-live="polite"><span class="eyebrow">Hub đang chọn</span><h3>${number(selected)}. ${esc(selected.name)}</h3>${badge(selected.status)}<div class="hub-map-resources"><span><strong>${selected.availableVehicles}</strong> xe sẵn sàng</span><span><strong>${selected.freeSpaces}</strong> chỗ đỗ trống</span><span><strong>${selected.freePorts}</strong> cổng sạc trống</span></div>${button('Xem chi tiết Hub', 'hub-detail', selected.id, 'primary small full')}</div><div class="hub-map-destinations"><h4>Di chuyển từ Hub đang chọn</h4>${others.length ? others.map((h) => `<button type="button" class="hub-map-destination" data-action="hub-map-select" data-id="${esc(h.id)}"><span>${number(h)}. ${esc(h.name)}${h.status !== 'ACTIVE' ? '<small>Đang bảo trì</small>' : ''}</span><strong>${selected.travelMinutesTo[h.id]} phút</strong></button>`).join('') : '<p class="metric-note">Xóa bớt bộ lọc để xem các Hub khác.</p>'}</div></aside></div>
  <p class="hub-map-caption">Vị trí tương đối theo tọa độ mẫu; đường nối không phải tuyến đường thực tế. Thời gian là giả định dùng chung với What-if.</p></section>`;
}
