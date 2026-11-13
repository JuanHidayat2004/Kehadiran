// ============================================================================
// js/app.js - Pengendali Utama Sistem Absensi Guru SD Berbasis RFID
// ============================================================================

import {
  STORAGE_KEYS,
  escapeHtml,
  getTodayISO,
  initGuruUI,
  seedInitialDataIfNeeded,
} from './guru.js';
import {
  DEFAULT_SETTINGS,
  getCurrentTimeHHMMSS,
  getDashboardSummary,
  getSettings,
  getStatusCssClass,
  getStatusIcon,
  initScannerUI,
  saveSettings,
} from './absensi.js';
import { initExcelUI } from './excel.js';
import { initLaporanUI } from './laporan.js';

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123',
  nama: 'Operator Sekolah',
};

function getAdminAccount() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN);
    return raw ? { ...DEFAULT_ADMIN, ...JSON.parse(raw) } : { ...DEFAULT_ADMIN };
  } catch {
    return { ...DEFAULT_ADMIN };
  }
}

function saveAdminAccount(acc) {
  localStorage.setItem(STORAGE_KEYS.ADMIN, JSON.stringify(acc));
}

function getAuthSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUTH);
    return raw ? JSON.parse(raw) : { loggedIn: false, kioskOnly: false };
  } catch {
    return { loggedIn: false, kioskOnly: false };
  }
}

function setAuthSession(session) {
  localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(session));
}

function formatTanggalIndonesia(dateObj = new Date()) {
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulan = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  return `${hari[dateObj.getDay()]}, ${dateObj.getDate()} ${bulan[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

// ============================================================================
// Toast & Modal Konfirmasi Universal (Tanpa window.alert / window.confirm)
// ============================================================================
function showToast(message, variant = 'primary') {
  const container = document.getElementById('toastContainer');
  if (!container || !window.bootstrap) return;

  const bgMap = {
    success: 'text-bg-success',
    danger: 'text-bg-danger',
    warning: 'text-bg-warning',
    info: 'text-bg-info',
    primary: 'text-bg-primary',
  };
  const cls = bgMap[variant] || 'text-bg-primary';

  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center ${cls} border-0`;
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body small fw-medium">${escapeHtml(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Tutup"></button>
    </div>
  `;
  container.appendChild(toastEl);

  const toast = new window.bootstrap.Toast(toastEl, { delay: 3800 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

let confirmModalInstance = null;
function confirmAction(title, message, onConfirm) {
  const modalEl = document.getElementById('confirmModal');
  if (!modalEl || !window.bootstrap) return;

  if (!confirmModalInstance) {
    confirmModalInstance = new window.bootstrap.Modal(modalEl);
  }

  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalMessage').textContent = message;

  const okBtn = document.getElementById('confirmModalOkBtn');
  const cloned = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(cloned, okBtn);

  cloned.addEventListener('click', () => {
    confirmModalInstance.hide();
    onConfirm?.();
  });

  confirmModalInstance.show();
}

// ============================================================================
// Inisialisasi Aplikasi
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  seedInitialDataIfNeeded();

  let guruController = null;
  let scannerController = null;
  let excelController = null;
  let laporanController = null;

  const pageTitles = {
    dashboard: 'Dashboard Utama',
    scanner: 'Mode Scanner RFID',
    guru: 'Manajemen Data Guru',
    import: 'Import Data Excel',
    laporan: 'Rekapitulasi & Ekspor Absensi',
    esp32: 'Integrasi ESP32 + RC522',
    pengaturan: 'Pengaturan Sistem',
  };

  function syncSchoolBrandingAndRules() {
    const s = getSettings();
    const admin = getAdminAccount();

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('loginSchoolName', s.namaSekolah);
    setText('sidebarSchoolName', s.namaSekolah);
    setText('navbarAdminName', admin.nama || admin.username);
    setText('dashRuleMasuk', s.jamMasuk);
    setText('dashRuleTelat', s.batasTerlambat);
    setText('dashRulePulang', s.jamPulang);
    setText('scannerRuleMasuk', s.jamMasuk);
    setText('scannerRuleTelat', s.batasTerlambat);
    setText('scannerRulePulang', s.jamPulang);
    setText('scannerCooldownInfo', String(s.cooldownDetik));

    // Isi form pengaturan
    const fillVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    fillVal('setNamaSekolah', s.namaSekolah);
    fillVal('setAlamatSekolah', s.alamatSekolah);
    fillVal('setJamMasuk', s.jamMasuk);
    fillVal('setBatasTelat', s.batasTerlambat);
    fillVal('setJamPulang', s.jamPulang);
    fillVal('setCooldown', s.cooldownDetik);
    fillVal('setAdminNama', admin.nama);
    fillVal('setAdminUsername', admin.username);
    fillVal('setAdminPassword', '');
  }

  function renderDashboard() {
    const summary = getDashboardSummary(getTodayISO());
    document.getElementById('statTotalGuru').textContent = String(summary.totalGuru);
    document.getElementById('statSudahHadir').textContent = String(summary.sudahHadir);
    document.getElementById('statBelumHadir').textContent = String(summary.belumHadir);
    document.getElementById('statSudahPulang').textContent = String(summary.sudahPulang);
    document.getElementById('statTerlambat').textContent = String(summary.terlambat);
    document.getElementById('statPersentase').textContent = `${summary.persentase}%`;

    const bar = document.getElementById('statProgressBar');
    if (bar) {
      bar.style.width = `${summary.persentase}%`;
      bar.setAttribute('aria-valuenow', String(summary.persentase));
    }

    const search = (document.getElementById('dashSearchInput')?.value || '').trim().toLowerCase();
    const statusFilter = document.getElementById('dashStatusFilter')?.value || 'semua';

    const filtered = summary.rows.filter((r) => {
      const matchQuery =
        !search ||
        r.nama.toLowerCase().includes(search) ||
        String(r.nip).toLowerCase().includes(search) ||
        String(r.guruId).toLowerCase().includes(search);
      const matchStatus = statusFilter === 'semua' || r.status === statusFilter;
      return matchQuery && matchStatus;
    });

    const tbody = document.getElementById('dashTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-secondary py-5">
            Tidak ada aktivitas absensi yang sesuai dengan filter.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered
      .map((r) => {
        const cls = getStatusCssClass(r.status);
        const icon = getStatusIcon(r.status);
        return `
          <tr>
            <td class="fw-semibold text-dark">${escapeHtml(r.nama)}</td>
            <td class="mono-text tabular-nums text-secondary">
              ${escapeHtml(r.nip)} <span class="text-muted">(${escapeHtml(r.guruId)})</span>
            </td>
            <td>${escapeHtml(r.jabatan)} · <span class="text-secondary">${escapeHtml(r.kelas)}</span></td>
            <td class="mono-text tabular-nums fw-medium">${escapeHtml(r.jamMasuk)}</td>
            <td class="mono-text tabular-nums fw-medium">${escapeHtml(r.jamPulang)}</td>
            <td>
              <span class="status-text ${cls}">
                <i class="bi ${icon}"></i>${escapeHtml(r.status)}
              </span>
            </td>
            <td class="small text-secondary">${escapeHtml(r.keterangan)}</td>
          </tr>
        `;
      })
      .join('');
  }

  function refreshAllViews() {
    syncSchoolBrandingAndRules();
    renderDashboard();
    guruController?.renderGuruTable();
    scannerController?.renderQuickSimButtons();
    scannerController?.renderRecentScanLogs();
    laporanController?.renderLaporan();
  }

  function navigateToPage(pageName) {
    if (pageName !== 'scanner' && document.body.classList.contains('kiosk-fullscreen')) {
      document.body.classList.remove('kiosk-fullscreen');
      const fsBtn = document.getElementById('btnScannerFullscreen');
      if (fsBtn) fsBtn.innerHTML = '<i class="bi bi-arrows-fullscreen me-1"></i>Layar Penuh';
    }

    const pages = document.querySelectorAll('.app-page');
    pages.forEach((p) => p.classList.add('d-none'));

    const target = document.getElementById(`page-${pageName}`);
    if (target) target.classList.remove('d-none');

    document.querySelectorAll('.nav-link-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === pageName);
    });

    const titleEl = document.getElementById('topbarPageTitle');
    if (titleEl) titleEl.textContent = pageTitles[pageName] || 'Dashboard';

    // Tutup offcanvas mobile jika sedang terbuka
    const sidebarEl = document.getElementById('appSidebar');
    if (sidebarEl && window.bootstrap) {
      const oc = window.bootstrap.Offcanvas.getInstance(sidebarEl);
      oc?.hide();
    }

    if (pageName === 'dashboard') renderDashboard();
    if (pageName === 'laporan') laporanController?.renderLaporan();
    if (pageName === 'scanner') {
      scannerController?.renderQuickSimButtons();
      scannerController?.renderRecentScanLogs();
      setTimeout(() => scannerController?.focusScannerInput(), 120);
    }
  }

  // ==================== Jam Digital Real-Time ====================
  function updateClock() {
    const now = new Date();
    const timeStr = getCurrentTimeHHMMSS();
    const dateStr = formatTanggalIndonesia(now);

    ['topbarClock', 'dashDigitalClock', 'scannerBigClock'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = timeStr;
    });

    ['topbarDateLabel', 'dashDateSub', 'scannerDateLabel'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = dateStr;
    });
  }
  updateClock();
  window.setInterval(updateClock, 1000);

  // ==================== Inisialisasi Modul ====================
  guruController = initGuruUI({
    showToast,
    confirmAction,
    onDataChanged: refreshAllViews,
  });

  scannerController = initScannerUI({
    showToast,
    onAttendanceUpdated: refreshAllViews,
    onRequestRegisterUid: (uid) => {
      const session = getAuthSession();
      if (!session.loggedIn) {
        showToast('Silakan login sebagai Admin untuk mendaftarkan guru baru.', 'warning');
        return;
      }
      navigateToPage('guru');
      guruController.openAddModalWithUid(uid);
    },
  });

  excelController = initExcelUI({
    showToast,
    onImportCompleted: refreshAllViews,
  });

  laporanController = initLaporanUI({
    showToast,
  });

  // ==================== Navigasi Sidebar & Shortcut ====================
  document.querySelectorAll('.nav-link-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      if (page) navigateToPage(page);
    });
  });

  document.querySelectorAll('[data-nav-shortcut]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-nav-shortcut');
      if (page) navigateToPage(page);
    });
  });

  document.getElementById('dashSearchInput')?.addEventListener('input', renderDashboard);
  document.getElementById('dashStatusFilter')?.addEventListener('change', renderDashboard);

  // ==================== Integrasi ESP32 Setup & Tester ====================
  function setupEsp32Page() {
    const endpointUrl = `${window.location.origin}/api/rfid/scan`;
    const urlInput = document.getElementById('esp32EndpointUrl');
    if (urlInput) urlInput.value = endpointUrl;

    const arduinoCodeEl = document.getElementById('esp32ArduinoCode');
    if (arduinoCodeEl) {
      arduinoCodeEl.textContent = `#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN  5
#define RST_PIN 22

const char* ssid = "NAMA_WIFI_SEKOLAH";
const char* password = "PASSWORD_WIFI";
const char* serverUrl = "${endpointUrl}";

MFRC522 rfid(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Terhubung!");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    String payload = "{\\"uid\\":\\"" + uid + "\\",\\"device_id\\":\\"ESP32-SD-LOBBY\\"}";
    int httpCode = http.POST(payload);
    Serial.println("UID: " + uid + " -> HTTP " + String(httpCode));
    http.end();
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1500);
}`;
    }

    document.getElementById('btnCopyEndpoint')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(endpointUrl);
        showToast('URL endpoint API berhasil disalin.', 'success');
      } catch {
        showToast('Salin URL secara manual dari kotak teks.', 'info');
      }
    });

    document.getElementById('btnCopyArduinoCode')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(arduinoCodeEl?.textContent || '');
        showToast('Kode Arduino ESP32 berhasil disalin.', 'success');
      } catch {
        showToast('Silakan pilih dan salin kode secara manual.', 'info');
      }
    });

    const testForm = document.getElementById('esp32TestForm');
    testForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const uid = document.getElementById('espTestUid')?.value || 'A1B2C3D4';
      const timeVal = document.getElementById('espTestTime')?.value;
      const statusEl = document.getElementById('espTestStatus');

      const payload = {
        uid,
        tanggal: getTodayISO(),
        waktu: timeVal ? `${timeVal}:00` : getCurrentTimeHHMMSS(),
        device_id: 'ESP32-SIMULASI-WEB',
      };

      try {
        const resp = await fetch('/api/rfid/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json();
        if (resp.ok) {
          if (statusEl) {
            statusEl.textContent = `HTTP 200 OK: UID ${data.data?.uid} diterima server perantara, memproses...`;
          }
          await scannerController?.fetchPendingEsp32Scans(true);
        } else {
          if (statusEl) statusEl.textContent = `Gagal: ${data.message || 'Error server'}`;
        }
      } catch {
        if (statusEl) statusEl.textContent = 'Tidak dapat menghubungi endpoint API /api/rfid/scan.';
      }
    });
  }
  setupEsp32Page();

  // ==================== Pengaturan Jam Kerja & Admin ====================
  document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      namaSekolah: document.getElementById('setNamaSekolah').value.trim(),
      alamatSekolah: document.getElementById('setAlamatSekolah').value.trim(),
      jamMasuk: document.getElementById('setJamMasuk').value,
      batasTerlambat: document.getElementById('setBatasTelat').value,
      jamPulang: document.getElementById('setJamPulang').value,
      cooldownDetik: Number(document.getElementById('setCooldown').value),
    };

    if (payload.batasTerlambat < payload.jamMasuk) {
      showToast('Batas keterlambatan tidak boleh lebih awal dari jam masuk.', 'warning');
      return;
    }

    saveSettings(payload);
    refreshAllViews();
    showToast('Pengaturan sekolah dan jam kerja berhasil disimpan.', 'success');
  });

  document.getElementById('adminAccountForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const current = getAdminAccount();
    const nama = document.getElementById('setAdminNama').value.trim();
    const username = document.getElementById('setAdminUsername').value.trim();
    const newPass = document.getElementById('setAdminPassword').value;

    if (!nama || !username) {
      showToast('Nama tampilan dan username admin wajib diisi.', 'warning');
      return;
    }

    saveAdminAccount({
      nama,
      username,
      password: newPass ? newPass : current.password,
    });
    syncSchoolBrandingAndRules();
    showToast('Akun administrator berhasil diperbarui.', 'success');
  });

  document.getElementById('btnResetDemoData')?.addEventListener('click', () => {
    confirmAction(
      'Reset Data Demo',
      'Ini akan mengembalikan data guru, absensi, dan jam kerja ke contoh awal. Lanjutkan?',
      () => {
        localStorage.removeItem(STORAGE_KEYS.INIT_FLAG);
        localStorage.removeItem(STORAGE_KEYS.GURU);
        localStorage.removeItem(STORAGE_KEYS.ABSENSI);
        saveSettings(DEFAULT_SETTINGS);
        seedInitialDataIfNeeded();
        excelController?.resetPreview();
        refreshAllViews();
        showToast('Data demo awal berhasil dipulihkan.', 'success');
      }
    );
  });

  // ==================== Manajemen Login / Logout Admin ====================
  const loginScreen = document.getElementById('loginScreen');
  const appShell = document.getElementById('appShell');
  const loginForm = document.getElementById('loginForm');
  const loginErrorAlert = document.getElementById('loginErrorAlert');
  const btnBackFromKiosk = document.getElementById('btnBackFromKiosk');

  function applyAuthView() {
    const session = getAuthSession();
    syncSchoolBrandingAndRules();

    if (session.loggedIn) {
      document.body.classList.remove('kiosk-fullscreen');
      loginScreen?.classList.add('d-none');
      appShell?.classList.remove('d-none');
      btnBackFromKiosk?.classList.add('d-none');
      navigateToPage('dashboard');
      refreshAllViews();
    } else if (session.kioskOnly) {
      loginScreen?.classList.add('d-none');
      appShell?.classList.remove('d-none');
      document.body.classList.add('kiosk-fullscreen');
      btnBackFromKiosk?.classList.remove('d-none');
      navigateToPage('scanner');
    } else {
      document.body.classList.remove('kiosk-fullscreen');
      appShell?.classList.add('d-none');
      loginScreen?.classList.remove('d-none');
      btnBackFromKiosk?.classList.add('d-none');
    }
  }

  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    const admin = getAdminAccount();

    if (u === admin.username && p === admin.password) {
      loginErrorAlert?.classList.add('d-none');
      setAuthSession({ loggedIn: true, kioskOnly: false, username: admin.username });
      applyAuthView();
      showToast(`Selamat datang, ${admin.nama}.`, 'success');
    } else {
      loginErrorAlert?.classList.remove('d-none');
    }
  });

  document.getElementById('toggleLoginPass')?.addEventListener('click', () => {
    const passInput = document.getElementById('loginPassword');
    const icon = document.querySelector('#toggleLoginPass i');
    if (!passInput) return;
    const isPass = passInput.type === 'password';
    passInput.type = isPass ? 'text' : 'password';
    if (icon) icon.className = isPass ? 'bi bi-eye-slash' : 'bi bi-eye';
  });

  document.getElementById('btnOpenKioskFromLogin')?.addEventListener('click', () => {
    setAuthSession({ loggedIn: false, kioskOnly: true });
    applyAuthView();
  });

  btnBackFromKiosk?.addEventListener('click', () => {
    setAuthSession({ loggedIn: false, kioskOnly: false });
    applyAuthView();
  });

  function handleLogout() {
    confirmAction('Konfirmasi Logout', 'Keluar dari sesi administrator sekarang?', () => {
      setAuthSession({ loggedIn: false, kioskOnly: false });
      document.getElementById('loginPassword').value = '';
      applyAuthView();
      showToast('Anda telah keluar dari sistem.', 'info');
    });
  }

  document.getElementById('btnLogoutSidebar')?.addEventListener('click', handleLogout);
  document.getElementById('btnLogoutNavbar')?.addEventListener('click', handleLogout);

  applyAuthView();
});
