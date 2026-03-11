// public/ui.js - Shared UI utilities
export function showModal(title, content) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = content;
  document.getElementById('modal').classList.add('active');
}

export function closeModal() {
  document.getElementById('modal').classList.remove('active');
}
window.closeModal = closeModal;

export function setPageHeader(title, subtitle) {
  const h1 = document.querySelector('.page-header h1');
  const p = document.querySelector('.page-header p');
  if (h1) h1.textContent = title;
  if (p) p.textContent = subtitle;
}

export function setTopActions(html) {
  const el = document.querySelector('.top-actions');
  if (el) el.innerHTML = html;
}

// Toast notification system
let _toastTimeout;
export function showToast(message, type = 'info') {
  let toast = document.getElementById('toastNotification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotification';
    document.body.appendChild(toast);
  }

  const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };
  toast.className = `toast toast-${type} show`;
  toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i><span>${message}</span>`;

  clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// Update active nav item
export function setActiveNav(routeName) {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

  const navMap = {
    dashboard: 'Dashboard',
    templates: 'Templates',
    credentials: 'Credentials',
    settings: 'Settings',
    execution: 'Dashboard',
    workflow: 'Dashboard',
  };

  const targetText = navMap[routeName] || 'Dashboard';

  document.querySelectorAll('.nav-item').forEach(item => {
    const span = item.querySelector('span');
    if (span && span.textContent.trim() === targetText) {
      item.classList.add('active');
    }
  });
}