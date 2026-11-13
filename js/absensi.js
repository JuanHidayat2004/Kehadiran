// ============================================================================
// js/absensi.js - Mesin Pencatatan Absensi RFID, Pengaturan Jam, & Polling ESP32
// ============================================================================

import {
  STORAGE_KEYS,
  escapeHtml,
  findGuruByUid,
  getActiveGuru,
  getTodayISO,
  normalizeUid,
} from './guru.js';

export const DEFAULT_SETTINGS = {
  namaSekolah: 'SD Negeri 01 Nusantara',
  alamatSekolah: 'Jl. Pendidikan No. 1, Kecamatan Cendekia',
  jamMasuk: '07:00',
  batasTerlambat: '07:15',
  jamPulang: '14:00',
  cooldownDetik: 10,
};

// Penyimpan timestamp scan terakhir per UID untuk mencegah scan ganda dalam waktu singkat
const lastScanTimestampByUid = new Map();

// Log sesi scan langsung (untuk tampilan Mode Scanner hari ini)
const SESSION_LOGS_KEY = 'sd_absensi_scan_events_v1';

export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(newSettings) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...newSettings,
    cooldownDetik: Math.max(3, Math.min(120, Number(newSettings.cooldownDetik) || 10)),
  };
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
  return merged;
}

export function getAllAbsensi() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ABSENSI);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveAllAbsensi(list) {
  localStorage.setItem(STORAGE_KEYS.ABSENSI, JSON.stringify(list));
}

export function getScanEventsToday() {
  try {
    const raw = localStorage.getItem(SESSION_LOGS_KEY);
    const events = raw ? JSON.parse(raw) : [];
    const today = getTodayISO();
    return Array.isArray(events) ? events.filter((e) => e.tanggal === today) : [];
  } catch {
    return [];
  }
}

function appendScanEvent(eventObj) {
  try {
    const raw = localStorage.getItem(SESSION_LOGS_KEY);
    const events = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(events) ? events : [];
    list.unshift(eventObj);
    localStorage.setItem(SESSION_LOGS_KEY, JSON.stringify(list.slice(0, 80)));
  } catch {
    // Abaikan jika penyimpanan penuh
  }
}

export function getCurrentTimeHHMMSS() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function timeToSeconds(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().replace('.', ':').split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts[2] ? parseInt(parts[2], 10) : 0;
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
  return h * 3600 + m * 60 + s;
}

export function normalizeTimeString(timeStr) {
  if (!timeStr) return '';
  const cleaned = String(timeStr).trim().replace('.', ':');
  const match = cleaned.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return '';
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] !== undefined ? Number(match[3]) : 0;
  if (h > 23 || m > 59 || s > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function evaluasiStatusMasuk(jamMasukStr, settings = getSettings()) {
  const masukSec = timeToSeconds(jamMasukStr);
  const jadwalMasukSec = timeToSeconds(settings.jamMasuk);
  const batasTelatSec = timeToSeconds(settings.batasTerlambat);

  if (masukSec === null || batasTelatSec === null) {
    return { statusMasuk: 'Tepat Waktu', keterangan: 'Tercatat masuk' };
  }

  if (masukSec <= batasTelatSec) {
    if (jadwalMasukSec !== null && masukSec < jadwalMasukSec) {
      const awalMenit = Math.floor((jadwalMasukSec - masukSec) / 60);
      return {
        statusMasuk: 'Tepat Waktu',
        keterangan: awalMenit > 0 ? `Masuk lebih awal ${awalMenit} menit` : 'Masuk tepat waktu',
      };
    }
    return { statusMasuk: 'Tepat Waktu', keterangan: 'Masuk tepat waktu' };
  }

  const telatMenit = Math.max(1, Math.ceil((masukSec - batasTelatSec) / 60));
  return {
    statusMasuk: 'Terlambat',
    keterangan: `Terlambat ${telatMenit} menit dari batas ${settings.batasTerlambat}`,
  };
}

/**
 * Mesin inti pencatatan absensi RFID:
 * - Memeriksa UID di Data Guru
 * - Mencegah scan ganda dalam cooldownDetik
 * - Scan 1 -> Absen Masuk
 * - Scan 2 -> Absen Pulang
 * - Scan >= 3 -> Tidak mengubah data yang sudah tersimpan
 */
export function prosesScanRFID(rawUid, tanggalArg = '', waktuArg = '', sumber = 'Scanner USB') {
  const uid = normalizeUid(rawUid);
  const settings = getSettings();
  const tanggal = tanggalArg && /^\d{4}-\d{2}-\d{2}$/.test(tanggalArg) ? tanggalArg : getTodayISO();
  const waktu = normalizeTimeString(waktuArg) || getCurrentTimeHHMMSS();

  if (!uid) {
    return {
      ok: false,
      type: 'danger',
      code: 'UID_KOSONG',
      title: 'UID Kartu Tidak Valid',
      message: 'Silakan tempelkan kartu RFID atau masukkan kode UID yang valid.',
      uid: '',
      tanggal,
      waktu,
    };
  }

  // 1. Cek anti-scan ganda (cooldown)
  const nowMs = Date.now();
  const cooldownMs = (settings.cooldownDetik || 10) * 1000;
  const lastMs = lastScanTimestampByUid.get(uid);
  if (lastMs && nowMs - lastMs < cooldownMs) {
    const sisaDetik = Math.ceil((cooldownMs - (nowMs - lastMs)) / 1000);
    return {
      ok: false,
      type: 'warning',
      code: 'COOLDOWN',
      title: 'Scan Ganda Dicegah',
      message: `Kartu UID ${uid} baru saja dipindai. Tunggu ${sisaDetik} detik sebelum memindai ulang.`,
      uid,
      tanggal,
      waktu,
    };
  }
  lastScanTimestampByUid.set(uid, nowMs);

  // 2. Cari identitas guru berdasarkan UID
  const guru = findGuruByUid(uid);
  if (!guru) {
    appendScanEvent({
      uid,
      nama: 'Tidak Dikenal',
      jenis: 'Ditolak',
      status: 'Kartu Tidak Dikenali',
      tanggal,
      waktu,
      sumber,
    });
    return {
      ok: false,
      type: 'danger',
      code: 'UID_TIDAK_DIKENAL',
      title: 'Kartu Tidak Dikenali',
      message: `UID kartu "${uid}" belum terdaftar pada data guru mana pun.`,
      uid,
      tanggal,
      waktu,
    };
  }

  if (guru.status !== 'Aktif') {
    appendScanEvent({
      uid,
      nama: guru.nama,
      jenis: 'Ditolak',
      status: 'Guru Nonaktif',
      tanggal,
      waktu,
      sumber,
    });
    return {
      ok: false,
      type: 'warning',
      code: 'GURU_NONAKTIF',
      title: 'Status Guru Nonaktif',
      message: `Kartu milik ${guru.nama} saat ini berstatus Nonaktif di sistem.`,
      uid,
      guru,
      tanggal,
      waktu,
    };
  }

  // 3. Cek catatan absensi guru pada tanggal tersebut
  const allAbsensi = getAllAbsensi();
  const existingIdx = allAbsensi.findIndex(
    (item) => item.tanggal === tanggal && (item.guruId === guru.id || normalizeUid(item.uid) === uid)
  );

  // SCAN PERTAMA -> ABSEN MASUK
  if (existingIdx === -1) {
    const evalMasuk = evaluasiStatusMasuk(waktu, settings);
    const newRecord = {
      id: `abs_${tanggal}_${guru.id}`,
      guruId: guru.id,
      uid: guru.uid,
      nama: guru.nama,
      nip: guru.nip,
      jabatan: guru.jabatan,
      kelas: guru.kelas,
      tanggal,
      jamMasuk: waktu,
      jamPulang: '',
      statusMasuk: evalMasuk.statusMasuk,
      statusAkhir: evalMasuk.statusMasuk,
      keterangan: evalMasuk.keterangan,
      sumber,
    };

    allAbsensi.unshift(newRecord);
    saveAllAbsensi(allAbsensi);

    appendScanEvent({
      uid: guru.uid,
      nama: guru.nama,
      jenis: 'ABSEN MASUK',
      status: evalMasuk.statusMasuk,
      tanggal,
      waktu,
      sumber,
    });

    return {
      ok: true,
      type: evalMasuk.statusMasuk === 'Terlambat' ? 'warning' : 'success',
      code: 'ABSEN_MASUK',
      title: 'Absen Masuk Berhasil',
      message: `${guru.nama} tercatat masuk pada pukul ${waktu} (${evalMasuk.statusMasuk}).`,
      jenisScan: 'ABSEN MASUK',
      guru,
      record: newRecord,
      tanggal,
      waktu,
    };
  }

  const existing = allAbsensi[existingIdx];

  // SCAN KEDUA -> ABSEN PULANG (jika jamPulang masih kosong)
  if (!existing.jamPulang) {
    const masukLabel = existing.statusMasuk || 'Tepat Waktu';
    const pulangTargetSec = timeToSeconds(settings.jamPulang);
    const scanSec = timeToSeconds(waktu);
    const pulangNote =
      pulangTargetSec !== null && scanSec !== null && scanSec < pulangTargetSec
        ? `Masuk ${masukLabel} · Pulang lebih awal`
        : `Masuk ${masukLabel} · Sudah absen pulang`;

    const updated = {
      ...existing,
      jamPulang: waktu,
      statusAkhir: 'Sudah Pulang',
      keterangan: pulangNote,
      sumberPulang: sumber,
    };

    allAbsensi[existingIdx] = updated;
    saveAllAbsensi(allAbsensi);

    appendScanEvent({
      uid: guru.uid,
      nama: guru.nama,
      jenis: 'ABSEN PULANG',
      status: 'Sudah Pulang',
      tanggal,
      waktu,
      sumber,
    });

    return {
      ok: true,
      type: 'info',
      code: 'ABSEN_PULANG',
      title: 'Absen Pulang Berhasil',
      message: `${guru.nama} tercatat pulang pada pukul ${waktu}.`,
      jenisScan: 'ABSEN PULANG',
      guru,
      record: updated,
      tanggal,
      waktu,
    };
  }

  // SCAN KETIGA DAN SETERUSNYA -> TIDAK BOLEH MENGUBAH DATA
  appendScanEvent({
    uid: guru.uid,
    nama: guru.nama,
    jenis: 'Diabaikan',
    status: 'Sudah Masuk & Pulang',
    tanggal,
    waktu,
    sumber,
  });

  return {
    ok: false,
    type: 'info',
    code: 'SUDAH_LENGKAP',
    title: 'Absensi Hari Ini Sudah Lengkap',
    message: `${guru.nama} sudah melakukan Absen Masuk (${existing.jamMasuk}) dan Absen Pulang (${existing.jamPulang}). Data tidak diubah.`,
    jenisScan: 'SUDAH LENGKAP',
    guru,
    record: existing,
    tanggal,
    waktu,
  };
}

/**
 * Menghitung ringkasan dashboard untuk tanggal hari ini
 */
export function getDashboardSummary(tanggal = getTodayISO()) {
  const activeGuru = getActiveGuru();
  const absensiHariIni = getAllAbsensi().filter((a) => a.tanggal === tanggal);

  const absensiByGuruId = new Map();
  for (const rec of absensiHariIni) {
    absensiByGuruId.set(rec.guruId, rec);
  }

  let sudahHadir = 0;
  let belumHadir = 0;
  let sudahPulang = 0;
  let terlambat = 0;

  const rows = activeGuru.map((guru) => {
    const rec = absensiByGuruId.get(guru.id);
    if (!rec || !rec.jamMasuk) {
      belumHadir++;
      return {
        guruId: guru.id,
        nama: guru.nama,
        nip: guru.nip,
        jabatan: guru.jabatan,
        kelas: guru.kelas,
        uid: guru.uid,
        jamMasuk: '-',
        jamPulang: '-',
        status: 'Belum Hadir',
        keterangan: 'Belum melakukan scan hari ini',
      };
    }

    sudahHadir++;
    if (rec.statusMasuk === 'Terlambat') {
      terlambat++;
    }
    if (rec.jamPulang) {
      sudahPulang++;
    }

    return {
      guruId: guru.id,
      nama: guru.nama,
      nip: guru.nip,
      jabatan: guru.jabatan,
      kelas: guru.kelas,
      uid: guru.uid,
      jamMasuk: rec.jamMasuk,
      jamPulang: rec.jamPulang || '-',
      status: rec.jamPulang ? 'Sudah Pulang' : rec.statusMasuk || 'Tepat Waktu',
      keterangan: rec.keterangan || '-',
    };
  });

  const totalGuru = activeGuru.length;
  const persentase = totalGuru > 0 ? Math.round((sudahHadir / totalGuru) * 100) : 0;

  return {
    totalGuru,
    sudahHadir,
    belumHadir,
    sudahPulang,
    terlambat,
    persentase,
    rows,
  };
}

export function getStatusCssClass(status) {
  switch (status) {
    case 'Tepat Waktu':
      return 'status-tepat';
    case 'Terlambat':
      return 'status-telat';
    case 'Sudah Pulang':
      return 'status-pulang';
    case 'Belum Hadir':
      return 'status-belum';
    default:
      return 'status-error';
  }
}

export function getStatusIcon(status) {
  switch (status) {
    case 'Tepat Waktu':
      return 'bi-check-circle-fill';
    case 'Terlambat':
      return 'bi-exclamation-triangle-fill';
    case 'Sudah Pulang':
      return 'bi-house-check-fill';
    case 'Belum Hadir':
      return 'bi-dash-circle';
    default:
      return 'bi-x-circle-fill';
  }
}

// ============================================================================
// Audio Beep Web Audio API (Feedback Suara Scanner)
// ============================================================================
let sharedAudioCtx = null;
function playBeepSound(isSuccess) {
  const toggle = document.getElementById('toggleSoundBeep');
  if (toggle && !toggle.checked) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    const ctx = sharedAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isSuccess) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.31);
    }
  } catch {
    // Abaikan error audio browser
  }
}

// ============================================================================
// UI Controller Halaman Mode Scanner & Polling Wi-Fi ESP32
// ============================================================================
export function initScannerUI(callbacks = {}) {
  const scanForm = document.getElementById('rfidScanForm');
  const uidInput = document.getElementById('rfidUidInput');
  const idleState = document.getElementById('scannerIdleState');
  const feedbackState = document.getElementById('scannerFeedbackState');
  const recentLogBody = document.getElementById('scannerRecentLogBody');
  const logCountEl = document.getElementById('scannerLogCount');
  const quickSimWrap = document.getElementById('scannerQuickSimButtons');
  const btnFullscreen = document.getElementById('btnScannerFullscreen');
  const toggleEsp32Polling = document.getElementById('toggleEsp32Polling');

  function renderQuickSimButtons() {
    if (!quickSimWrap) return;
    const sampleGuru = getActiveGuru().slice(0, 4);
    const buttonsHtml = sampleGuru
      .map(
        (g) => `
        <button
          type="button"
          class="btn btn-outline-primary btn-sm btn-sim-uid"
          data-uid="${escapeHtml(g.uid)}"
        >
          <span class="mono-text fw-semibold">${escapeHtml(g.uid)}</span> · ${escapeHtml(
            g.nama.split(',')[0]
          )}
        </button>`
      )
      .join('');

    const unknownBtn = `
      <button type="button" class="btn btn-outline-danger btn-sm btn-sim-uid" data-uid="FF009911">
        <span class="mono-text">FF009911</span> · Kartu Asing
      </button>`;

    quickSimWrap.innerHTML = buttonsHtml + unknownBtn;
    quickSimWrap.querySelectorAll('.btn-sim-uid').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleScanSubmit(btn.dataset.uid, 'Simulasi Tombol');
      });
    });
  }

  function renderRecentScanLogs() {
    if (!recentLogBody) return;
    const logs = getScanEventsToday();
    if (logCountEl) {
      logCountEl.textContent = `${logs.length} scan tercatat hari ini`;
    }

    if (logs.length === 0) {
      recentLogBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-secondary py-4">
            Belum ada aktivitas scan langsung pada sesi hari ini.
          </td>
        </tr>
      `;
      return;
    }

    recentLogBody.innerHTML = logs
      .slice(0, 12)
      .map((item) => {
        const cls = getStatusCssClass(item.status);
        return `
          <tr>
            <td class="mono-text tabular-nums">${escapeHtml(item.waktu)}</td>
            <td class="mono-text fw-semibold">${escapeHtml(item.uid)}</td>
            <td class="fw-medium">${escapeHtml(item.nama)}</td>
            <td class="fw-semibold">${escapeHtml(item.jenis)}</td>
            <td><span class="status-text ${cls}">${escapeHtml(item.status)}</span></td>
            <td class="text-secondary small">${escapeHtml(item.sumber)}</td>
          </tr>
        `;
      })
      .join('');
  }

  function showScannerFeedback(result) {
    if (!idleState || !feedbackState) return;
    idleState.classList.add('d-none');
    feedbackState.classList.remove('d-none');

    const boxClassMap = {
      success: 'scanner-result-success',
      info: 'scanner-result-info',
      warning: 'scanner-result-warning',
      danger: 'scanner-result-danger',
    };
    const iconMap = {
      success: 'bi-check-circle-fill text-success',
      info: 'bi-info-circle-fill text-primary',
      warning: 'bi-exclamation-triangle-fill text-warning',
      danger: 'bi-x-octagon-fill text-danger',
    };

    const boxCls = boxClassMap[result.type] || 'scanner-result-info';
    const iconCls = iconMap[result.type] || 'bi-info-circle-fill text-primary';

    let detailHtml = '';
    if (result.guru) {
      const g = result.guru;
      const rec = result.record;
      detailHtml = `
        <div class="mt-3 pt-3 border-top border-secondary-subtle">
          <div class="row g-3">
            <div class="col-sm-6">
              <div class="small text-secondary">Nama Guru</div>
              <div class="fw-bold fs-5 text-dark">${escapeHtml(g.nama)}</div>
              <div class="small text-secondary mt-1">
                NIP: <span class="mono-text text-dark">${escapeHtml(g.nip)}</span> ·
                ID: <span class="mono-text text-dark">${escapeHtml(g.id)}</span>
              </div>
            </div>
            <div class="col-sm-6">
              <div class="small text-secondary">Jabatan &amp; Kelas</div>
              <div class="fw-semibold text-dark">${escapeHtml(g.jabatan)} (${escapeHtml(g.kelas)})</div>
              <div class="small text-secondary mt-1">
                UID RFID: <span class="mono-text fw-semibold text-primary">${escapeHtml(g.uid)}</span>
              </div>
            </div>
          </div>
          ${
            rec
              ? `
            <div class="row g-2 mt-3 pt-2 border-top border-secondary-subtle">
              <div class="col-4">
                <div class="small text-secondary">Jam Masuk</div>
                <div class="mono-text fw-bold text-dark tabular-nums">${escapeHtml(rec.jamMasuk || '-')}</div>
              </div>
              <div class="col-4">
                <div class="small text-secondary">Jam Pulang</div>
                <div class="mono-text fw-bold text-dark tabular-nums">${escapeHtml(rec.jamPulang || '-')}</div>
              </div>
              <div class="col-4">
                <div class="small text-secondary">Status</div>
                <div class="fw-bold ${getStatusCssClass(rec.statusAkhir)}">${escapeHtml(rec.statusAkhir)}</div>
              </div>
            </div>`
              : ''
          }
        </div>
      `;
    } else if (result.code === 'UID_TIDAK_DIKENAL' && result.uid) {
      detailHtml = `
        <div class="mt-3 pt-3 border-top border-danger-subtle d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div class="small text-dark">
            Ingin mendaftarkan UID <strong class="mono-text">${escapeHtml(result.uid)}</strong> ke guru baru?
          </div>
          <button
            type="button"
            class="btn btn-outline-danger btn-sm"
            id="btnQuickRegisterUnknownUid"
            data-uid="${escapeHtml(result.uid)}"
          >
            <i class="bi bi-person-plus me-1"></i>Daftarkan UID Ini
          </button>
        </div>
      `;
    }

    feedbackState.innerHTML = `
      <div class="scanner-result-box ${boxCls}">
        <div class="d-flex align-items-start gap-3">
          <i class="bi ${iconCls} fs-1 lh-1"></i>
          <div class="flex-grow-1 min-w-0">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <h4 class="h5 fw-bold text-dark mb-0">${escapeHtml(result.title)}</h4>
              <span class="mono-text small fw-semibold text-secondary tabular-nums">
                ${escapeHtml(result.tanggal)} · ${escapeHtml(result.waktu)}
              </span>
            </div>
            <p class="mb-0 mt-1 text-dark">${escapeHtml(result.message)}</p>
          </div>
        </div>
        ${detailHtml}
      </div>
    `;

    const quickRegBtn = document.getElementById('btnQuickRegisterUnknownUid');
    quickRegBtn?.addEventListener('click', () => {
      callbacks.onRequestRegisterUid?.(quickRegBtn.dataset.uid);
    });
  }

  function handleScanSubmit(rawUid, sumber = 'Scanner USB', tanggal = '', waktu = '') {
    const result = prosesScanRFID(rawUid, tanggal, waktu, sumber);
    playBeepSound(result.ok);
    showScannerFeedback(result);
    renderRecentScanLogs();
    callbacks.onAttendanceUpdated?.();

    if (uidInput) {
      uidInput.value = '';
      uidInput.focus();
    }
    return result;
  }

  scanForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const uid = uidInput?.value || '';
    handleScanSubmit(uid, 'Scanner USB / Manual');
  });

  btnFullscreen?.addEventListener('click', () => {
    const active = document.body.classList.toggle('kiosk-fullscreen');
    btnFullscreen.innerHTML = active
      ? '<i class="bi bi-fullscreen-exit me-1"></i>Keluar Layar Penuh'
      : '<i class="bi bi-arrows-fullscreen me-1"></i>Layar Penuh';
    uidInput?.focus();
  });

  // ============================================================================
  // Polling Server Perantara Metode B (ESP32 + RC522 melalui Wi-Fi HTTP POST)
  // ============================================================================
  let pollingTimer = null;
  let isPolling = false;
  const processedScanIds = new Set();

  async function fetchPendingEsp32Scans(force = false) {
    if (!force && toggleEsp32Polling && !toggleEsp32Polling.checked) return;
    if (isPolling) return;
    isPolling = true;
    try {
      const resp = await fetch('/api/rfid/pending', { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data || !Array.isArray(data.scans) || data.scans.length === 0) return;

      const ackIds = [];
      for (const item of data.scans) {
        if (processedScanIds.has(item.id)) {
          ackIds.push(item.id);
          continue;
        }
        processedScanIds.add(item.id);
        const res = handleScanSubmit(item.uid, item.deviceId || 'ESP32-WiFi', item.tanggal, item.waktu);
        ackIds.push(item.id);
        callbacks.showToast?.(
          `[ESP32 Wi-Fi] ${res.title}: ${res.guru ? res.guru.nama : item.uid}`,
          res.ok ? 'success' : 'warning'
        );
      }

      if (ackIds.length > 0) {
        await fetch('/api/rfid/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ackIds }),
        });
      }
    } catch {
      // Server offline atau sedang tidak terjangkau, lanjutkan polling berikutnya
    } finally {
      isPolling = false;
    }
  }

  function startPolling() {
    if (pollingTimer) return;
    pollingTimer = window.setInterval(fetchPendingEsp32Scans, 2000);
  }

  startPolling();
  renderQuickSimButtons();
  renderRecentScanLogs();

  return {
    renderQuickSimButtons,
    renderRecentScanLogs,
    handleScanSubmit,
    focusScannerInput: () => uidInput?.focus(),
    fetchPendingEsp32Scans,
  };
}
