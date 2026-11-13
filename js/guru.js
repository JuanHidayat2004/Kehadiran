// ============================================================================
// js/guru.js - Manajemen Data Guru & Penyimpanan LocalStorage
// ============================================================================

export const STORAGE_KEYS = {
  GURU: 'sd_absensi_guru_v1',
  ABSENSI: 'sd_absensi_log_v1',
  SETTINGS: 'sd_absensi_settings_v1',
  ADMIN: 'sd_absensi_admin_v1',
  AUTH: 'sd_absensi_auth_v1',
  INIT_FLAG: 'sd_absensi_initialized_v1',
};

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeUid(uid) {
  return String(uid || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

export function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function seedInitialDataIfNeeded() {
  if (localStorage.getItem(STORAGE_KEYS.INIT_FLAG) === 'true') {
    return;
  }

  const defaultGuru = [
    {
      id: 'G-001',
      nama: 'Drs. H. Ahmad Fauzi, M.Pd.',
      nip: '196904121994031004',
      jabatan: 'Kepala Sekolah',
      kelas: 'Pimpinan',
      uid: 'A1B2C3D4',
      status: 'Aktif',
    },
    {
      id: 'G-002',
      nama: 'Siti Aminah, S.Pd.',
      nip: '198207152008012011',
      jabatan: 'Guru Kelas',
      kelas: 'Kelas 1A',
      uid: 'E5F6G7H8',
      status: 'Aktif',
    },
    {
      id: 'G-003',
      nama: 'Budi Santoso, S.Pd.',
      nip: '198511032010011009',
      jabatan: 'Guru Kelas',
      kelas: 'Kelas 2A',
      uid: '11223344',
      status: 'Aktif',
    },
    {
      id: 'G-004',
      nama: 'Dewi Lestari, S.Pd.SD',
      nip: '198802202014022003',
      jabatan: 'Guru Kelas',
      kelas: 'Kelas 3A',
      uid: '55667788',
      status: 'Aktif',
    },
    {
      id: 'G-005',
      nama: 'Rizky Pratama, S.Or.',
      nip: '199209142019031007',
      jabatan: 'Guru Mata Pelajaran',
      kelas: 'PJOK',
      uid: '99AABBCC',
      status: 'Aktif',
    },
    {
      id: 'G-006',
      nama: 'Nurul Hidayah, S.Pd.I.',
      nip: '199005282015022002',
      jabatan: 'Guru Mata Pelajaran',
      kelas: 'Pendidikan Agama Islam',
      uid: 'DDEEFF00',
      status: 'Aktif',
    },
    {
      id: 'G-007',
      nama: 'Hendra Wijaya, S.Pd.',
      nip: '198712112011011006',
      jabatan: 'Guru Kelas',
      kelas: 'Kelas 5A',
      uid: '778899AA',
      status: 'Aktif',
    },
    {
      id: 'G-008',
      nama: 'Ratna Sari, S.Pd.',
      nip: '199403072020122014',
      jabatan: 'Guru Kelas',
      kelas: 'Kelas 6A',
      uid: 'BBCCDD11',
      status: 'Aktif',
    },
  ];

  const today = getTodayISO();
  const defaultAbsensi = [
    {
      id: `abs_${today}_G-001`,
      guruId: 'G-001',
      uid: 'A1B2C3D4',
      nama: 'Drs. H. Ahmad Fauzi, M.Pd.',
      nip: '196904121994031004',
      jabatan: 'Kepala Sekolah',
      kelas: 'Pimpinan',
      tanggal: today,
      jamMasuk: '06:45:12',
      jamPulang: '',
      statusMasuk: 'Tepat Waktu',
      statusAkhir: 'Tepat Waktu',
      keterangan: 'Masuk lebih awal 14 menit',
      sumber: 'ESP32-WiFi',
    },
    {
      id: `abs_${today}_G-002`,
      guruId: 'G-002',
      uid: 'E5F6G7H8',
      nama: 'Siti Aminah, S.Pd.',
      nip: '198207152008012011',
      jabatan: 'Guru Kelas',
      kelas: 'Kelas 1A',
      tanggal: today,
      jamMasuk: '07:22:08',
      jamPulang: '',
      statusMasuk: 'Terlambat',
      statusAkhir: 'Terlambat',
      keterangan: 'Terlambat 7 menit dari batas 07:15',
      sumber: 'ESP32-WiFi',
    },
    {
      id: `abs_${today}_G-003`,
      guruId: 'G-003',
      uid: '11223344',
      nama: 'Budi Santoso, S.Pd.',
      nip: '198511032010011009',
      jabatan: 'Guru Kelas',
      kelas: 'Kelas 2A',
      tanggal: today,
      jamMasuk: '06:58:40',
      jamPulang: '14:05:19',
      statusMasuk: 'Tepat Waktu',
      statusAkhir: 'Sudah Pulang',
      keterangan: 'Masuk Tepat Waktu · Sudah absen pulang',
      sumber: 'Import Excel',
    },
    {
      id: `abs_${today}_G-004`,
      guruId: 'G-004',
      uid: '55667788',
      nama: 'Dewi Lestari, S.Pd.SD',
      nip: '198802202014022003',
      jabatan: 'Guru Kelas',
      kelas: 'Kelas 3A',
      tanggal: today,
      jamMasuk: '07:04:10',
      jamPulang: '',
      statusMasuk: 'Tepat Waktu',
      statusAkhir: 'Tepat Waktu',
      keterangan: 'Masuk dalam batas toleransi',
      sumber: 'Scanner USB',
    },
  ];

  localStorage.setItem(STORAGE_KEYS.GURU, JSON.stringify(defaultGuru));
  localStorage.setItem(STORAGE_KEYS.ABSENSI, JSON.stringify(defaultAbsensi));
  localStorage.setItem(STORAGE_KEYS.INIT_FLAG, 'true');
}

export function getAllGuru() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GURU);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveAllGuru(list) {
  localStorage.setItem(STORAGE_KEYS.GURU, JSON.stringify(list));
}

export function getActiveGuru() {
  return getAllGuru().filter((g) => g.status === 'Aktif');
}

export function findGuruByUid(uid) {
  const target = normalizeUid(uid);
  if (!target) return null;
  return getAllGuru().find((g) => normalizeUid(g.uid) === target) || null;
}

export function findGuruById(id) {
  return getAllGuru().find((g) => g.id === id) || null;
}

export function generateNextGuruId() {
  const list = getAllGuru();
  let maxNum = 0;
  for (const item of list) {
    const match = String(item.id || '').match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `G-${String(maxNum + 1).padStart(3, '0')}`;
}

export function addGuru(guruData) {
  const list = getAllGuru();
  const cleanUid = normalizeUid(guruData.uid);
  const cleanId = String(guruData.id || '').trim();

  if (!cleanId || !guruData.nama || !cleanUid) {
    return { ok: false, message: 'ID Guru, Nama Lengkap, dan UID RFID wajib diisi.' };
  }
  if (list.some((g) => g.id.toLowerCase() === cleanId.toLowerCase())) {
    return { ok: false, message: `ID Guru "${cleanId}" sudah digunakan.` };
  }
  if (list.some((g) => normalizeUid(g.uid) === cleanUid)) {
    return { ok: false, message: `UID RFID "${cleanUid}" sudah terdaftar pada guru lain.` };
  }

  const newRecord = {
    id: cleanId,
    nama: String(guruData.nama).trim(),
    nip: String(guruData.nip || '-').trim(),
    jabatan: String(guruData.jabatan || 'Guru Kelas').trim(),
    kelas: String(guruData.kelas || '-').trim(),
    uid: cleanUid,
    status: guruData.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
  };

  list.push(newRecord);
  saveAllGuru(list);
  return { ok: true, data: newRecord };
}

export function updateGuru(originalId, guruData) {
  const list = getAllGuru();
  const idx = list.findIndex((g) => g.id === originalId);
  if (idx === -1) {
    return { ok: false, message: 'Data guru tidak ditemukan.' };
  }

  const cleanUid = normalizeUid(guruData.uid);
  const cleanId = String(guruData.id || '').trim();

  if (!cleanId || !guruData.nama || !cleanUid) {
    return { ok: false, message: 'ID Guru, Nama Lengkap, dan UID RFID wajib diisi.' };
  }
  if (list.some((g, i) => i !== idx && g.id.toLowerCase() === cleanId.toLowerCase())) {
    return { ok: false, message: `ID Guru "${cleanId}" sudah dipakai guru lain.` };
  }
  if (list.some((g, i) => i !== idx && normalizeUid(g.uid) === cleanUid)) {
    return { ok: false, message: `UID RFID "${cleanUid}" sudah terdaftar pada guru lain.` };
  }

  list[idx] = {
    id: cleanId,
    nama: String(guruData.nama).trim(),
    nip: String(guruData.nip || '-').trim(),
    jabatan: String(guruData.jabatan || 'Guru Kelas').trim(),
    kelas: String(guruData.kelas || '-').trim(),
    uid: cleanUid,
    status: guruData.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
  };

  saveAllGuru(list);
  return { ok: true, data: list[idx] };
}

export function deleteGuru(id) {
  const list = getAllGuru();
  const nextList = list.filter((g) => g.id !== id);
  if (nextList.length === list.length) {
    return { ok: false, message: 'Data guru tidak ditemukan.' };
  }
  saveAllGuru(nextList);
  return { ok: true };
}

// ============================================================================
// UI Controller Halaman Manajemen Data Guru
// ============================================================================
export function initGuruUI(callbacks = {}) {
  const searchInput = document.getElementById('guruSearchInput');
  const statusFilter = document.getElementById('guruStatusFilter');
  const btnTambah = document.getElementById('btnTambahGuru');
  const guruForm = document.getElementById('guruForm');
  const guruModalEl = document.getElementById('guruModal');

  let guruModalInstance = null;
  function getGuruModal() {
    if (!guruModalInstance && window.bootstrap && guruModalEl) {
      guruModalInstance = new window.bootstrap.Modal(guruModalEl);
    }
    return guruModalInstance;
  }

  function openAddModal(prefillUid = '') {
    document.getElementById('guruModalLabel').textContent = 'Tambah Data Guru';
    document.getElementById('guruFormOriginalId').value = '';
    const idInput = document.getElementById('guruId');
    idInput.value = generateNextGuruId();
    idInput.readOnly = false;
    document.getElementById('guruNip').value = '';
    document.getElementById('guruNama').value = '';
    document.getElementById('guruJabatan').value = 'Guru Kelas';
    document.getElementById('guruKelas').value = '';
    document.getElementById('guruUid').value = normalizeUid(prefillUid);
    document.getElementById('guruStatus').value = 'Aktif';
    getGuruModal()?.show();
  }

  function openEditModal(id) {
    const guru = findGuruById(id);
    if (!guru) return;
    document.getElementById('guruModalLabel').textContent = 'Edit Data Guru';
    document.getElementById('guruFormOriginalId').value = guru.id;
    const idInput = document.getElementById('guruId');
    idInput.value = guru.id;
    idInput.readOnly = true;
    document.getElementById('guruNip').value = guru.nip;
    document.getElementById('guruNama').value = guru.nama;
    document.getElementById('guruJabatan').value = guru.jabatan;
    document.getElementById('guruKelas').value = guru.kelas;
    document.getElementById('guruUid').value = guru.uid;
    document.getElementById('guruStatus').value = guru.status;
    getGuruModal()?.show();
  }

  function renderGuruTable() {
    const tbody = document.getElementById('guruTableBody');
    const countLabel = document.getElementById('guruCountLabel');
    if (!tbody) return;

    const query = (searchInput?.value || '').trim().toLowerCase();
    const statusVal = statusFilter?.value || 'semua';

    const all = getAllGuru();
    const filtered = all.filter((g) => {
      const matchStatus = statusVal === 'semua' || g.status === statusVal;
      const matchQuery =
        !query ||
        g.nama.toLowerCase().includes(query) ||
        g.nip.toLowerCase().includes(query) ||
        g.id.toLowerCase().includes(query) ||
        g.kelas.toLowerCase().includes(query) ||
        g.uid.toLowerCase().includes(query);
      return matchStatus && matchQuery;
    });

    if (countLabel) {
      countLabel.textContent = `Menampilkan ${filtered.length} dari ${all.length} guru`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-secondary py-5">
            Belum ada data guru yang sesuai dengan pencarian.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered
      .map((g) => {
        const isAktif = g.status === 'Aktif';
        return `
          <tr>
            <td class="mono-text fw-semibold text-primary">${escapeHtml(g.id)}</td>
            <td class="fw-semibold text-dark">${escapeHtml(g.nama)}</td>
            <td class="mono-text tabular-nums text-secondary">${escapeHtml(g.nip)}</td>
            <td>${escapeHtml(g.jabatan)}</td>
            <td>${escapeHtml(g.kelas)}</td>
            <td class="mono-text fw-semibold">${escapeHtml(g.uid)}</td>
            <td>
              <span class="status-text ${isAktif ? 'status-pulang' : 'status-belum'}">
                <i class="bi ${isAktif ? 'bi-check-circle' : 'bi-pause-circle'}"></i>
                ${escapeHtml(g.status)}
              </span>
            </td>
            <td class="text-end text-nowrap">
              <button
                type="button"
                class="btn btn-outline-primary btn-sm me-1 btn-edit-guru"
                data-id="${escapeHtml(g.id)}"
                title="Edit data guru"
              >
                <i class="bi bi-pencil-square"></i>
              </button>
              <button
                type="button"
                class="btn btn-outline-danger btn-sm btn-delete-guru"
                data-id="${escapeHtml(g.id)}"
                data-nama="${escapeHtml(g.nama)}"
                title="Hapus guru"
              >
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-guru').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.btn-delete-guru').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const nama = btn.dataset.nama;
        callbacks.confirmAction?.(
          'Hapus Data Guru',
          `Apakah Anda yakin ingin menghapus data guru "${nama}" (${id})?`,
          () => {
            const res = deleteGuru(id);
            if (res.ok) {
              callbacks.showToast?.(`Data guru ${nama} berhasil dihapus.`, 'success');
              renderGuruTable();
              callbacks.onDataChanged?.();
            } else {
              callbacks.showToast?.(res.message, 'danger');
            }
          }
        );
      });
    });
  }

  btnTambah?.addEventListener('click', () => openAddModal());
  searchInput?.addEventListener('input', renderGuruTable);
  statusFilter?.addEventListener('change', renderGuruTable);

  guruForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const originalId = document.getElementById('guruFormOriginalId').value;
    const payload = {
      id: document.getElementById('guruId').value,
      nip: document.getElementById('guruNip').value,
      nama: document.getElementById('guruNama').value,
      jabatan: document.getElementById('guruJabatan').value,
      kelas: document.getElementById('guruKelas').value,
      uid: document.getElementById('guruUid').value,
      status: document.getElementById('guruStatus').value,
    };

    const result = originalId ? updateGuru(originalId, payload) : addGuru(payload);
    if (!result.ok) {
      callbacks.showToast?.(result.message, 'danger');
      return;
    }

    getGuruModal()?.hide();
    callbacks.showToast?.(
      originalId ? 'Data guru berhasil diperbarui.' : 'Guru baru berhasil ditambahkan.',
      'success'
    );
    renderGuruTable();
    callbacks.onDataChanged?.();
  });

  renderGuruTable();

  return {
    renderGuruTable,
    openAddModalWithUid: openAddModal,
  };
}
