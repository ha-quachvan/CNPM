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
  assert.equal(await customer.locator('.hub-map-pin').count(), 6);
  await customer.locator('.hub-map-pin[data-id=hub-bk]').focus();
  await customer.keyboard.press('Enter');
  assert.equal(
    await customer.locator('.hub-map-pin[data-id=hub-bk]').getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await customer
      .locator('.hub-map-pin[data-id=hub-bk]')
      .evaluate((n) => n === document.activeElement),
    true,
  );
  assert.match(
    await customer.locator('.hub-map-destination[data-id=hub-library]').innerText(),
    /5 phút/,
  );
  await customer.screenshot({ path: 'artifacts/hubs-map-desktop.png', fullPage: true });
  await customer.locator('#hub-search [name=area]').fill('Ký túc');
  await customer.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await customer.waitForFunction(() => document.querySelectorAll('.hub-map-pin').length === 2);
  await customer.locator('#hub-search [name=area]').fill('khong-co-hub-nay');
  await customer.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await customer.getByRole('heading', { name: 'Chưa có Hub phù hợp', exact: true }).waitFor();
  assert.equal(await customer.locator('.hub-map-panel').count(), 0);
  await customer.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  assert.equal(await customer.locator('.hub-map-pin').count(), 6);
  await customer.locator('.hub-card [data-action=hub-detail][data-id=hub-metro]').click();
  await dialog(customer).locator('[data-action=reserve-vehicle]').first().click();
  await dialog(customer).locator('[name=returnHubId]').selectOption('hub-bk');
  await clickDialog(customer, 'Giữ xe 15 phút');
  const r = (await ws(customer)).reservations.find(
    (r) => r.kind === 'VEHICLE' && r.status === 'HELD',
  );
  assert.equal(r.plannedReturnHubId, 'hub-bk');
  assert.equal(
    (await ws(customer)).spaces.find((p) => p.id === r.plannedReturnSpaceId).status,
    'HELD',
  );
  await customer.locator(`[data-action=pickup][data-id="${r.id}"]`).click();
  await dialog(customer).locator('[name=code]').fill('000000');
  await dialog(customer).getByRole('button', { name: 'Xác nhận nhận xe', exact: true }).click();
  await dialog(customer).locator('#dialog-error').waitFor({ state: 'visible' });
  await dialog(customer).locator('[name=code]').fill(r.pickupCode);
  await clickDialog(customer, 'Xác nhận nhận xe');
  await customer.locator('[data-action=destination-change]').click();
  await dialog(customer).locator('[name=hubId]').selectOption('hub-library');
  await clickDialog(customer, 'Xác nhận đổi');
  await customer.getByRole('button', { name: 'Trả xe tại Hub', exact: true }).click();
  assert.equal(await dialog(customer).locator('[name=hubId]').inputValue(), 'hub-library');
  await dialog(customer).locator('[name=arrived]').check();
  await clickDialog(customer, 'Xác nhận trả xe');
  const returned = (await ws(customer)).rentals.find((x) => x.reservationId === r.id);
  assert.equal(returned.status, 'COMPLETED');
  assert.equal(returned.penalty, 0);
  await navigate(customer, 'vehicles');
  await customer.getByRole('button', { name: 'Đặt chỗ đỗ', exact: true }).first().click();
  await dialog(customer).locator('[name=hubId]').selectOption('hub-b');
  await clickDialog(customer, 'Giữ chỗ đỗ');
  await customer.getByRole('button', { name: 'Xác nhận đỗ', exact: true }).click();
  await clickDialog(customer, 'Xe đã vào chỗ');
  assert.equal(
    (await ws(customer)).vehicles.find((v) => v.id === 'personal-2').currentHubId,
    'hub-b',
  );
  await customer.locator('[data-action=parking-checkout][data-id=personal-2]').click();
  await clickDialog(customer, 'Xác nhận lấy xe');
  assert.equal(
    (await ws(customer)).vehicles.find((v) => v.id === 'personal-2').currentHubId,
    undefined,
  );
  await navigate(customer, 'charging');
  await customer.getByRole('button', { name: 'Yêu cầu sạc', exact: true }).click();
  await dialog(customer).locator('[name=vehicleId]').selectOption('personal-1');
  await dialog(customer).locator('[name=targetBattery]').fill('36');
  await clickDialog(customer, 'Gửi yêu cầu');
  const chargeRequest = (await ws(customer)).reservations.find(
    (r) => r.kind === 'CHARGING' && r.vehicleId === 'personal-1' && r.status === 'HELD',
  );
  assert.ok(chargeRequest);
  await customer.getByRole('button', { name: 'Bắt đầu sạc', exact: true }).click();
  await clickDialog(customer, 'Bắt đầu sạc');
  const charge = (await ws(customer)).chargingSessions.find((c) => c.vehicleId === 'personal-1');
  assert.equal(charge.status, 'ACTIVE');
  const operator = await account('operator');
  await operator.screenshot({ path: 'artifacts/operator-desktop.png', fullPage: true });
  await navigate(operator, 'demo');
  await operator.getByRole('button', { name: '+1 phút', exact: true }).click();
  await clickDialog(operator, 'Tiến thời gian');
  await navigate(customer, 'charging');
  assert.equal(
    (await ws(customer)).chargingSessions.find((c) => c.id === charge.id).status,
    'AWAITING_DISCONNECT',
  );
  await customer.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
  await clickDialog(customer, 'Xác nhận ngắt kết nối');
  assert.equal(
    (await ws(customer)).chargingSessions.find((c) => c.id === charge.id).status,
    'COMPLETED',
  );
  await navigate(customer, 'vehicles');
  await customer.locator('[data-action=parking-checkout][data-id=personal-1]').click();
  await clickDialog(customer, 'Xác nhận lấy xe');
  await navigate(customer, 'notifications');
  assert.ok((await ws(customer)).notifications.some((n) => n.kind === 'CHARGE_TARGET'));
  await customer.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true }).click();
  await customer.getByText('Đã đánh dấu thông báo đã đọc.', { exact: true }).waitFor();
  assert.ok((await ws(customer)).notifications.every((n) => n.readAt));
  await navigate(operator, 'charging');
  assert.equal(
    await operator
      .locator(
        '[data-action=charge-start], [data-action=charge-stop], [data-action=charge-disconnect]',
      )
      .count(),
    0,
  );
  assert.equal(await operator.locator('.charging-log').getAttribute('open'), null);
  await operator.getByText('Nhật ký phiên sạc toàn hệ thống', { exact: false }).waitFor();
  await operator.locator('.charging-log summary').click();
  await operator.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await operator.getByText('Dữ liệu đã được cập nhật.', { exact: true }).waitFor();
  assert.equal(await operator.locator('.charging-log').evaluate((n) => n.open), true);
  await operator.locator('.charging-log summary').click();
  const technician = await account('technician');
  await navigate(technician, 'charging');
  assert.equal(await technician.locator('[data-id=session-seed-active]').count(), 0);
  assert.equal(await technician.locator('[data-action=charge-new]').count(), 0);
  await technician.locator('[data-action=charge-stop][data-id=session-seed-fleet-1]').click();
  await clickDialog(technician, 'Dừng sạc');
  assert.equal((await ws(technician)).ports.find((p) => p.id === 'hub-a-c2').status, 'CONNECTED');
  assert.equal(
    (await ws(operator)).reservations.find((r) => r.id === 'charge-seed-wait-2').status,
    'WAITING',
  );
  await technician.locator('[data-action=charge-disconnect][data-id=session-seed-fleet-1]').click();
  await clickDialog(technician, 'Xác nhận ngắt kết nối');
  assert.equal(
    (await ws(operator)).reservations.find((r) => r.id === 'charge-seed-wait-2').status,
    'HELD',
  );
  await navigate(operator, 'charging');
  await operator.locator('[data-action=charge-new]').click();
  await dialog(operator).locator('[name=vehicleId]').selectOption('hub-metro-v2');
  await dialog(operator).locator('[name=targetBattery]').fill('90');
  await clickDialog(operator, 'Gửi yêu cầu');
  const fleetRequest = (await ws(operator)).reservations.find(
    (r) => r.vehicleId === 'hub-metro-v2' && r.kind === 'CHARGING' && r.status === 'HELD',
  );
  assert.ok(fleetRequest);
  assert.equal(await operator.locator('[data-action=charge-start]').count(), 0);
  await operator.screenshot({ path: 'artifacts/charging-operator.png', fullPage: true });
  await navigate(technician, 'charging');
  await technician.locator(`[data-action=charge-start][data-id="${fleetRequest.id}"]`).click();
  await clickDialog(technician, 'Bắt đầu sạc');
  const fleetSession = (await ws(technician)).chargingSessions.find(
    (c) => c.reservationId === fleetRequest.id,
  );
  assert.equal(fleetSession.status, 'ACTIVE');
  await technician.locator(`[data-action=charge-stop][data-id="${fleetSession.id}"]`).click();
  await clickDialog(technician, 'Dừng sạc');
  await technician.locator(`[data-action=charge-disconnect][data-id="${fleetSession.id}"]`).click();
  await clickDialog(technician, 'Xác nhận ngắt kết nối');
  await technician.screenshot({ path: 'artifacts/charging-technician.png', fullPage: true });
  await navigate(operator, 'demo');
  assert.equal(await operator.locator('#command-form').count(), 0);
  assert.equal(await operator.getByText('Phản hồi thiết bị giả lập', { exact: true }).count(), 0);
  await operator.screenshot({ path: 'artifacts/demo-tools.png', fullPage: true });
  await navigate(customer, 'incidents');
  await customer.getByRole('button', { name: 'Báo cáo sự cố', exact: true }).click();
  await dialog(customer).locator('[name=targetId]').selectOption('hub-a-v3');
  await dialog(customer).locator('[name=description]').fill('Phanh xe cần kiểm tra.');
  await clickDialog(customer, 'Gửi báo cáo');
  const incident = (await ws(customer)).incidents.find(
    (i) => i.description === 'Phanh xe cần kiểm tra.',
  );
  await navigate(customer, 'profile');
  await customer.locator('[name=fullName]').fill('Nguyễn Minh Anh');
  await customer.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await customer.getByText('Đã lưu thông tin cá nhân.', { exact: true }).waitFor();
  await navigate(operator, 'dispatch');
  await operator.getByRole('button', { name: 'Tạo lệnh điều phối', exact: true }).click();
  await dialog(operator).locator('[name=fromHubId]').selectOption('hub-a');
  await dialog(operator).locator('[name=toHubId]').selectOption('hub-b');
  await clickDialog(operator, 'Tạo lệnh');
  const order = (await ws(operator)).dispatchOrders.find((o) => o.status === 'PENDING');
  assert.ok(order);
  await navigate(operator, 'what-if');
  const metric = (assessment, key) => assessment.metrics.find((m) => m.key === key)?.value;
  const calculate = async () => {
    const response = operator.waitForResponse(
      (r) => r.url().endsWith('/api/what-if') && r.request().method() === 'POST',
    );
    await operator.getByRole('button', { name: 'Tính phương án', exact: true }).click();
    const r = await response;
    assert.equal(r.status(), 200);
    const result = await r.json();
    await operator.waitForFunction(
      () => !document.querySelector('#whatif-form [type=submit]').disabled,
    );
    await operator.getByRole('heading', { name: 'Đánh giá tài nguyên', exact: true }).waitFor();
    assert.equal(await operator.locator('#whatif-error').isVisible(), false);
    assert.equal(await operator.locator('#whatif-stale').isVisible(), false);
    assert.equal(await operator.locator('.trial-result').count(), 0);
    assert.equal(await operator.locator('.static-details[open]').count(), 0);
    return result;
  };
  const tryPlan = async (result, proposal = result.proposals[0]) => {
    assert.ok(proposal);
    if (await operator.locator('#proposal-choice').count())
      await operator.locator('#proposal-choice').selectOption(proposal.id);
    const response = operator.waitForResponse((r) => r.url().endsWith('/api/what-if/trial'));
    await operator.locator('[data-action=whatif-trial]').click();
    const r = await response;
    assert.equal(r.status(), 200);
    const trial = await r.json();
    await operator.getByRole('heading', { name: 'Kết quả thử phương án', exact: true }).waitFor();
    assert.deepEqual(trial.before, result.assessment);
    assert.equal(trial.proposalId, proposal.id);
    return trial;
  };
  assert.equal(await operator.locator('[name=horizonMinutes], [name=seed]').count(), 0);
  const demand = await calculate();
  assert.equal(metric(demand.assessment, 'requiredVehicles'), 8);
  await operator.getByRole('heading', { name: 'Phép tính', exact: true }).waitFor();
  assert.equal(
    await operator
      .getByRole('heading', { name: 'Cơ sở từ toàn mạng lưới', exact: true, includeHidden: true })
      .count(),
    1,
  );
  await operator.waitForFunction(() => document.querySelector('#toasts').childElementCount === 0);
  await operator.screenshot({ path: 'artifacts/whatif-impact.png', fullPage: true });
  const vehicleTrial = await tryPlan(demand);
  assert.ok(metric(vehicleTrial.after, 'shortage') < metric(vehicleTrial.before, 'shortage'));
  await operator.waitForFunction(() => document.querySelector('#toasts').childElementCount === 0);
  await operator.screenshot({ path: 'artifacts/whatif-single-trial.png', fullPage: true });
  await operator.locator('[name=requiredVehicles]').fill('9');
  assert.equal(await operator.locator('[data-action=whatif-trial]').isDisabled(), true);
  assert.equal(await operator.locator('#whatif-stale').isVisible(), true);
  await operator.locator('[name=demandMode]').selectOption('MULTIPLIER');
  await operator.locator('[name=baselineDemand]').fill('4');
  await operator.locator('[name=multiplier]').fill('2');
  const multiplied = await calculate();
  assert.equal(metric(multiplied.assessment, 'requiredVehicles'), 8);
  for (const type of ['HUB_FULL', 'VEHICLE_IMBALANCE', 'CHARGING_SURGE', 'PORT_FAILURE']) {
    await operator.locator('#scenario-type').selectOption(type);
    if (type === 'VEHICLE_IMBALANCE')
      assert.equal(await operator.locator('#whatif-form [name=targetHubId]').count(), 0);
    const result = await calculate();
    assert.equal(await operator.locator('#scenario-type').inputValue(), type);
    if (type === 'CHARGING_SURGE') {
      const recovery = result.proposals.find((p) => p.id === 'recover:hub-a-c4');
      const trial = await tryPlan(result, recovery);
      assert.ok(metric(trial.after, 'assignedByPlan') > 0);
      assert.ok(metric(trial.after, 'totalWaiting') < metric(trial.before, 'totalWaiting'));
    } else if (type === 'PORT_FAILURE') {
      const trial = await tryPlan(
        result,
        result.proposals.find((p) => p.id === 'recover:hub-a-c1'),
      );
      assert.equal(metric(trial.after, 'affectedSessions'), 0);
      assert.equal(metric(trial.after, 'assignedByPlan'), 0);
      assert.equal(metric(trial.after, 'freePorts'), 0);
      await operator.locator('[name=portId]').selectOption('hub-a-c4');
      const emptyFault = await calculate();
      const repair = await tryPlan(
        emptyFault,
        emptyFault.proposals.find((p) => p.id === 'recover:hub-a-c4'),
      );
      assert.equal(metric(repair.after, 'assignedByPlan'), 1);
    } else if (result.proposals.length) await tryPlan(result);
    await operator.waitForFunction(() => document.querySelector('#toasts').childElementCount === 0);
    await operator.screenshot({
      path: `artifacts/whatif-${type.toLowerCase()}.png`,
      fullPage: true,
    });
  }
  await operator.locator('.static-details summary').click();
  assert.equal(await operator.locator('.static-details').evaluate((n) => n.open), true);
  assert.ok(await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await operator.locator('.static-details summary').click();
  await operator.screenshot({ path: 'artifacts/whatif-desktop.png', fullPage: true });
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
  for (const [name, p, pages] of [
    [
      'customer',
      customer,
      [
        'overview',
        'hubs',
        'reservations',
        'rentals',
        'vehicles',
        'charging',
        'incidents',
        'notifications',
        'profile',
      ],
    ],
    [
      'operator',
      operator,
      [
        'overview',
        'hubs',
        'dispatch',
        'charging',
        'incidents',
        'what-if',
        'demo',
        'notifications',
        'profile',
      ],
    ],
    [
      'technician',
      technician,
      ['overview', 'hubs', 'dispatch', 'charging', 'incidents', 'notifications', 'profile'],
    ],
  ]) {
    for (const width of [1440, 768, 390]) {
      await p.setViewportSize({ width, height: 900 });
      for (const hash of pages) {
        await navigate(p, hash);
        if (hash === 'hubs') {
          assert.equal(await p.locator('.hub-map-pin').count(), 6);
          await p.locator('.hub-map-pin[data-id=hub-nvh]').click();
          assert.equal(
            await p.locator('.hub-map-pin[data-id=hub-nvh]').getAttribute('aria-pressed'),
            'true',
          );
          await p.screenshot({ path: `artifacts/${name}-hubs-${width}.png`, fullPage: true });
        }
        if (hash === 'what-if')
          await p.screenshot({ path: `artifacts/whatif-${width}.png`, fullPage: true });
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
    'PASS: three-role browser workflows, 75 page/viewport checks, no uncaught JS errors.',
  );
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
  server.close();
  await once(server, 'close');
}
