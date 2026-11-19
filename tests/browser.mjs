import { chromium } from 'playwright';
import { createApp } from '../dist/app.js';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const app = createApp();
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  args: process.env.CI ? ['--no-sandbox'] : [],
});
const errors = [];
const contexts = [];
await mkdir('artifacts', { recursive: true });
async function account(name) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  contexts.push(c);
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (dialog) => {
    errors.push('Unexpected dialog: ' + dialog.message());
    dialog.dismiss();
  });
  await p.goto(base + '/pages/auth/login.html');
  await p.locator('[name=identifier]').fill(name + '@hub.local');
  await p.locator('[name=password]').fill('Demo@12345');
  await p.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await p.waitForURL(
    '**/pages/' +
      (name.startsWith('customer')
        ? 'customer'
        : name.startsWith('technician')
          ? 'technician'
          : 'operator') +
      '/index.html',
  );
  await p.locator('.page-heading').waitFor();
  return p;
}
const dialog = (p) => p.getByRole('dialog');
async function clickDialog(p, title) {
  await dialog(p).getByRole('button', { name: title, exact: true }).click();
  await dialog(p).waitFor({ state: 'hidden' });
}
async function ws(p) {
  const r = await p.request.get(base + '/api/workspace');
  assert.equal(r.status(), 200);
  return r.json();
}
async function navigate(p, hash) {
  await p.goto(base + '/pages/' + (await ws(p)).user.role.toLowerCase() + '/index.html#' + hash);
  await p.locator('.page-heading').waitFor();
}
try {
  const authContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  contexts.push(authContext);
  const authPage = await authContext.newPage();
  authPage.on('pageerror', (e) => errors.push(e.message));
  await authPage.goto(base + '/pages/auth/register.html');
  await authPage.locator('[name=fullName]').fill('Khách kiểm tra giao diện');
  await authPage.locator('[name=email]').fill('browser@example.com');
  await authPage.locator('[name=password]').fill('Secure@123');
  await authPage.locator('[name=confirmPassword]').fill('Secure@123');
  await authPage.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await authPage.getByRole('heading', { name: 'Chào mừng trở lại', exact: true }).waitFor();
  await authPage.goto(base + '/pages/auth/reset.html');
  await authPage.locator('[name=identifier]').fill('browser@example.com');
  await authPage.getByRole('button', { name: 'Lấy mã xác minh', exact: true }).click();
  const resetCode = await authPage.locator('.notice .mono').textContent();
  await authPage.locator('[name=code]').fill(resetCode);
  await authPage.locator('[name=password]').fill('Renew@123');
  await authPage.locator('[name=confirmPassword]').fill('Renew@123');
  await authPage.getByRole('button', { name: 'Đặt lại mật khẩu', exact: true }).click();
  await authPage.locator('[name=identifier]').fill('browser@example.com');
  await authPage.locator('[name=password]').fill('Renew@123');
  await authPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await authPage.waitForURL('**/pages/customer/index.html');
  await authPage.locator('.page-heading').waitFor();
  await authPage.locator('[data-action=logout]').click();
  await clickDialog(authPage, 'Đăng xuất');
  await authPage.waitForURL('**/pages/auth/login.html');
  await authPage.getByRole('button', { name: 'Google · Demo', exact: true }).click();
  await authPage.waitForURL('**/pages/customer/index.html');
  await authPage.locator('.page-heading').waitFor();
  await authPage.locator('[data-action=logout]').click();
  await clickDialog(authPage, 'Đăng xuất');
  await authPage.waitForURL('**/pages/auth/login.html');
  await authPage.getByRole('button', { name: 'Clerk · Demo', exact: true }).click();
  await authPage.waitForURL('**/pages/customer/index.html');
  await authPage.locator('.page-heading').waitFor();
  const customer = await account('customer');
  await customer.screenshot({ path: 'artifacts/customer-desktop.png', fullPage: true });
  await navigate(customer, 'hubs');
  await customer.locator('[data-action=hub-detail][data-id=hub-a]').click();
  await dialog(customer).locator('[data-action=reserve-vehicle]').first().click();
  await clickDialog(customer, 'Giữ xe 15 phút');
  const r = (await ws(customer)).reservations.find(
    (r) => r.kind === 'VEHICLE' && r.status === 'HELD',
  );
  assert.ok(r);
  await customer.locator(`[data-action=pickup][data-id="${r.id}"]`).click();
  await dialog(customer).locator('[name=code]').fill('000000');
  await dialog(customer).getByRole('button', { name: 'Xác nhận nhận xe', exact: true }).click();
  await dialog(customer).locator('#dialog-error').waitFor({ state: 'visible' });
  await dialog(customer).locator('[name=code]').fill(r.pickupCode);
  await clickDialog(customer, 'Xác nhận nhận xe');
  await customer.getByRole('button', { name: 'Trả xe tại Hub', exact: true }).click();
  await clickDialog(customer, 'Xác nhận trả xe');
  assert.equal((await ws(customer)).rentals[0].status, 'COMPLETED');
  await navigate(customer, 'reservations');
  await customer.getByRole('button', { name: 'Đặt chỗ đỗ', exact: true }).click();
  await dialog(customer).locator('[name=hubId]').selectOption('hub-b');
  await clickDialog(customer, 'Giữ chỗ đỗ');
  await customer.getByRole('button', { name: 'Xác nhận đỗ', exact: true }).click();
  await clickDialog(customer, 'Xe đã vào chỗ');
  await navigate(customer, 'charging');
  await customer.getByRole('button', { name: 'Yêu cầu sạc', exact: true }).click();
  await dialog(customer).locator('[name=vehicleId]').selectOption('personal-1');
  await clickDialog(customer, 'Gửi yêu cầu');
  await customer.getByRole('button', { name: 'Bắt đầu sạc', exact: true }).click();
  await clickDialog(customer, 'Bắt đầu sạc');
  assert.equal((await ws(customer)).chargingSessions[0].status, 'ACTIVE');
  await navigate(customer, 'incidents');
  await customer.getByRole('button', { name: 'Báo cáo sự cố', exact: true }).click();
  await dialog(customer).locator('[name=targetId]').selectOption('hub-a-v2');
  await dialog(customer).locator('[name=description]').fill('Phanh xe cần kiểm tra.');
  await clickDialog(customer, 'Gửi báo cáo');
  const incident = (await ws(customer)).incidents.find(
    (i) => i.description === 'Phanh xe cần kiểm tra.',
  );
  await navigate(customer, 'profile');
  await customer.locator('[name=fullName]').fill('Nguyễn Minh Anh');
  await customer.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await customer.getByText('Đã lưu thông tin cá nhân.', { exact: true }).waitFor();
  const operator = await account('operator');
  await operator.screenshot({ path: 'artifacts/operator-desktop.png', fullPage: true });
  await navigate(operator, 'dispatch');
  await operator.getByRole('button', { name: 'Tạo lệnh điều phối', exact: true }).click();
  await dialog(operator).locator('[name=toHubId]').selectOption('hub-b');
  await clickDialog(operator, 'Tạo lệnh');
  const order = (await ws(operator)).dispatchOrders[0];
  assert.equal(order.status, 'PENDING');
  await navigate(operator, 'what-if');
  await operator.getByRole('button', { name: 'Chạy mô phỏng', exact: true }).click();
  await operator.getByRole('heading', { name: 'Kết quả phân tích', exact: true }).waitFor();
  await operator.getByRole('heading', { name: 'Khuyến nghị vận hành', exact: true }).waitFor();
  await operator.locator('#scenario-type').selectOption('PORT_FAILURE');
  await operator.getByRole('button', { name: 'Chạy mô phỏng', exact: true }).click();
  await operator.getByText('Cổng sạc gặp sự cố · Ký túc xá Khu A', { exact: false }).waitFor();
  assert.equal(await operator.locator('#scenario-type').inputValue(), 'PORT_FAILURE');
  await operator.screenshot({ path: 'artifacts/whatif-desktop.png', fullPage: true });
  const technician = await account('technician');
  await navigate(technician, 'incidents');
  await technician.locator(`[data-action=incident-accept][data-id="${incident.id}"]`).click();
  await clickDialog(technician, 'Nhận xử lý');
  await technician.locator(`[data-action=incident-resolve][data-id="${incident.id}"]`).click();
  await dialog(technician).locator('[name=notes]').fill('Đã kiểm tra và xử lý phanh.');
  await clickDialog(technician, 'Hoàn tất xử lý');
  await navigate(technician, 'dispatch');
  await technician.locator(`[data-action=dispatch-accept][data-id="${order.id}"]`).click();
  await clickDialog(technician, 'Nhận lệnh');
  await technician.locator(`[data-action=dispatch-complete][data-id="${order.id}"]`).click();
  await clickDialog(technician, 'Hoàn tất bàn giao');
  assert.equal(
    (await ws(technician)).dispatchOrders.find((o) => o.id === order.id).status,
    'COMPLETED',
  );
  await navigate(operator, 'demo');
  await operator.getByRole('button', { name: '+1 giờ', exact: true }).click();
  await clickDialog(operator, 'Tiến thời gian');
  await navigate(customer, 'charging');
  assert.equal((await ws(customer)).chargingSessions[0].status, 'COMPLETED');
  for (const [name, p, pages] of [
    [
      'customer',
      customer,
      ['overview', 'hubs', 'reservations', 'rentals', 'charging', 'incidents', 'profile'],
    ],
    [
      'operator',
      operator,
      ['overview', 'hubs', 'dispatch', 'incidents', 'what-if', 'demo', 'profile'],
    ],
    ['technician', technician, ['overview', 'hubs', 'dispatch', 'incidents', 'profile']],
  ]) {
    for (const width of [1440, 768, 390]) {
      await p.setViewportSize({ width, height: 900 });
      for (const hash of pages) {
        await navigate(p, hash);
        assert.ok(
          await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${name}/${hash} overflow at ${width}`,
        );
      }
      await navigate(p, 'overview');
      if (width === 390) {
        assert.equal(
          await p.locator('#sidebar').evaluate((n) => getComputedStyle(n).visibility),
          'hidden',
        );
        await p.locator('[data-action=menu]').click();
        assert.equal(
          await p.locator('#sidebar').evaluate((n) => getComputedStyle(n).visibility),
          'visible',
        );
        await p.locator('[data-action=menu-close]').click({ position: { x: 350, y: 10 } });
        assert.equal(
          await p.locator('#sidebar').evaluate((n) => getComputedStyle(n).visibility),
          'hidden',
        );
      }
      assert.ok((await p.locator('#toasts .toast').count()) <= 3);
      await p.screenshot({ path: `artifacts/${name}-${width}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: three-role browser workflows, 57 page/viewport checks, no uncaught JS errors.',
  );
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
  server.close();
  await once(server, 'close');
}
