import { api } from './api.js';
import { esc, icon, field, input, toast } from './ui.js';
const box = document.querySelector('#auth-content');
let mode = location.pathname.includes('register')
  ? 'register'
  : location.pathname.includes('reset')
    ? 'reset'
    : 'login';
let challenge;
function render() {
  document.title = `${mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Khôi phục mật khẩu'} — E-Mobility Hub`;
  const titles = {
    login: ['Chào mừng trở lại', 'Đăng nhập để bắt đầu hành trình của bạn.'],
    register: ['Tạo tài khoản mới', 'Tham gia không gian di chuyển của ĐHQG-HCM.'],
    reset: ['Khôi phục mật khẩu', 'Xác minh tài khoản và thiết lập mật khẩu mới.'],
  };
  box.innerHTML = `<span class="eyebrow">SMART E-MOBILITY HUB</span><h1 style="margin-top:10px">${titles[mode][0]}</h1><p class="muted">${titles[mode][1]}</p><form id="auth-form">
    ${mode === 'register' ? field('fullName', 'Họ và tên', input('fullName', 'text', '', 'required maxlength="80" autocomplete="name"')) + field('email', 'Email', input('email', 'email', '', 'autocomplete="email" maxlength="200"')) + field('phone', 'Số điện thoại', input('phone', 'tel', '', 'autocomplete="tel" pattern="[+]?[0-9]{9,15}"'), 'Điền ít nhất email hoặc số điện thoại.') : ''}
    ${mode === 'login' || (mode === 'reset' && !challenge) ? field('identifier', 'Email hoặc số điện thoại', input('identifier', 'text', '', 'required autocomplete="username" maxlength="200" placeholder="Nhập email hoặc SĐT"')) : ''}
    ${challenge && mode === 'reset' ? `<div class="notice">Mã xác minh demo: <strong class="mono">${esc(challenge.demoCode)}</strong><br>Mã chỉ dùng trong mô phỏng, hiệu lực 5 phút.</div>` + field('code', 'Mã xác minh', input('code', 'text', '', 'required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"')) : ''}
    ${mode !== 'reset' || challenge ? field('password', mode === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu', input('password', 'password', '', 'required minlength="8" maxlength="128" autocomplete="' + (mode === 'login' ? 'current-password' : 'new-password') + '"'), mode !== 'login' ? 'Từ 8 ký tự, có chữ hoa, chữ thường và số.' : '') : ''}
    ${mode === 'register' || (mode === 'reset' && challenge) ? field('confirmPassword', 'Xác nhận mật khẩu', input('confirmPassword', 'password', '', 'required minlength="8" maxlength="128" autocomplete="new-password"')) : ''}
    ${mode === 'login' ? '<div class="auth-links"><label class="checkbox"><input type="checkbox" id="show-password">Hiện mật khẩu</label><a href="/pages/auth/reset.html" class="text-btn">Quên mật khẩu?</a></div>' : ''}
    <div id="auth-error" class="form-error" role="alert" hidden></div><button class="btn primary full" type="submit">${mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : challenge ? 'Đặt lại mật khẩu' : 'Lấy mã xác minh'}${icon('arrow')}</button></form>
    ${mode === 'login' ? `<div class="auth-divider">HOẶC ĐĂNG NHẬP GIẢ LẬP</div><div class="form-grid"><button class="btn secondary" data-provider="google-demo-customer">Google · Demo</button><button class="btn secondary" data-provider="clerk-demo-customer">Clerk · Demo</button></div><p class="auth-small-footer">Chưa có tài khoản? <a href="/pages/auth/register.html" class="text-btn">Đăng ký ngay</a></p><div class="auth-demo"><p>Tài khoản dùng thử · mật khẩu <strong class="mono">Demo@12345</strong></p><div class="demo-roles"><button class="btn secondary" data-role="customer">Khách hàng</button><button class="btn secondary" data-role="operator">Điều hành</button><button class="btn secondary" data-role="technician">Kỹ thuật viên</button></div></div>` : '<p class="auth-small-footer"><a class="text-btn" href="/pages/auth/login.html">← Quay lại đăng nhập</a></p>'}
    <p class="auth-small-footer">Dữ liệu demo được nạp lại khi backend khởi động.</p>`;
  box
    .querySelector('#show-password')
    ?.addEventListener(
      'change',
      (e) => (box.querySelector('[name=password]').type = e.target.checked ? 'text' : 'password'),
    );
  box.querySelectorAll('[data-role]').forEach(
    (b) =>
      (b.onclick = () => {
        box.querySelector('[name=identifier]').value = b.dataset.role + '@hub.local';
        box.querySelector('[name=password]').value = 'Demo@12345';
        box.querySelector('[type=submit]').focus();
      }),
  );
  box.querySelectorAll('[data-provider]').forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          await api('/auth/provider', { method: 'POST', body: { token: b.dataset.provider } });
          location.replace('/');
        } catch (e) {
          showError(e);
        } finally {
          b.disabled = false;
        }
      }),
  );
  box.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const submit = e.target.querySelector('[type=submit]');
    submit.disabled = true;
    box.querySelector('#auth-error').hidden = true;
    try {
      if (mode === 'login') {
        await api('/auth/login', { method: 'POST', body: data });
        location.replace('/');
      } else if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: data });
        toast('Tạo tài khoản thành công. Bạn có thể đăng nhập.');
        mode = 'login';
        render();
      } else if (!challenge) {
        challenge = await api('/auth/password-reset/request', {
          method: 'POST',
          body: { identifier: data.identifier },
        });
        render();
      } else {
        await api('/auth/password-reset', {
          method: 'POST',
          body: {
            challengeId: challenge.challengeId,
            code: data.code,
            newPassword: data.password,
            confirmPassword: data.confirmPassword,
          },
        });
        challenge = undefined;
        mode = 'login';
        render();
        toast('Đã đặt lại mật khẩu. Vui lòng đăng nhập.');
      }
    } catch (err) {
      showError(err);
    } finally {
      submit.disabled = false;
    }
  };
}
function showError(error) {
  const n = box.querySelector('#auth-error');
  n.textContent = error.message;
  n.hidden = false;
}
render();
