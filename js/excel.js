// ============================================================================
// js/excel.js - Import Data Absensi Excel/CSV menggunakan SheetJS (XLSX.js)
// ============================================================================

import { escapeHtml, findGuruByUid, getTodayISO, normalizeUid } from './guru.js';
import {
  evaluasiStatusMasuk,
  getAllAbsensi,
  getSettings,
  normalizeTimeString,
  saveAllAbsensi,
  timeToSeconds,
} from './absensi.js';

function normalizeHeaderName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function findColumnKey(headers, candidates) {
  for (const h of headers) {
    const norm = normalizeHeaderName(h);
    if (candidates.some((c) => norm === c || norm.includes(c))) {
      return h;
    }
  }
  return null;
}

function parseExcelDate(val) {
  if (val === null || val === undefined || val === '') return '';

  // Excel serial number
  if (typeof val === 'number' && window.XLSX?.SSF?.parse_date_code) {
    const parsed = window.XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(val).trim();
  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return '';
}

function parseExcelTime(val) {
  if (val === null || val === undefined || val === '') return '';

  // Excel fraction of day (0..1)
  if (typeof val === 'number') {
    const fraction = val >= 1 ? val % 1 : val;
    const totalSeconds = Math.round(fraction * 86400);
    const h = Math.floor(totalSeconds / 3600) % 24;
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  return normalizeTimeString(String(val));
}

export function initExcelUI(callbacks = {}) {
  const dropZone = document.getElementById('excelDropZone');
  const fileInput = document.getElementById('excelFileInput');
  const btnSelectFile = document.getElementById('btnSelectExcelFile');
  const btnDownloadTemplate = document.getElementById('btnDownloadTemplateExcel');
  const btnConfirm = document.getElementById('btnConfirmExcelImport');
  const btnReset = document.getElementById('btnResetExcelPreview');
  const fileNameLabel = document.getElementById('excelFileNameLabel');
  const previewSummary = document.getElementById('excelPreviewSummary');
  const previewBody = document.getElementById('excelPreviewBody');
  const errorAlert = document.getElementById('excelErrorAlert');
  const resultAlert = document.getElementById('excelResultAlert');
  const duplicateBox = document.getElementById('excelDuplicateOptionBox');

  let parsedRows = [];

  function resetAlerts() {
    errorAlert?.classList.add('d-none');
    resultAlert?.classList.add('d-none');
  }

  function showError(msg) {
    if (!errorAlert) return;
    errorAlert.textContent = msg;
    errorAlert.classList.remove('d-none');
  }

  function resetPreview() {
    parsedRows = [];
    if (fileInput) fileInput.value = '';
    if (fileNameLabel) fileNameLabel.textContent = 'Belum ada file dipilih';
    if (previewSummary) previewSummary.textContent = 'Unggah file Excel untuk melihat pratinjau validasi data.';
    btnConfirm?.classList.add('d-none');
    btnReset?.classList.add('d-none');
    duplicateBox?.classList.add('d-none');
    resetAlerts();
    if (previewBody) {
      previewBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-secondary py-5">
            Belum ada data Excel yang dimuat.
          </td>
        </tr>
      `;
    }
  }

  function renderPreviewTable() {
    if (!previewBody) return;
    if (parsedRows.length === 0) {
      resetPreview();
      return;
    }

    const totalValidBaru = parsedRows.filter((r) => r.state === 'BARU').length;
    const totalDuplikat = parsedRows.filter((r) => r.state === 'DUPLIKAT').length;
    const totalError = parsedRows.filter((r) => r.state === 'ERROR').length;

    if (previewSummary) {
      previewSummary.textContent = `${parsedRows.length} baris dibaca · ${totalValidBaru} baru · ${totalDuplikat} sudah ada · ${totalError} tidak valid`;
    }

    previewBody.innerHTML = parsedRows
      .map((row) => {
        let statusHtml = '';
        if (row.state === 'BARU') {
          statusHtml = `<span class="status-text status-tepat"><i class="bi bi-check-circle"></i>Siap Impor</span>`;
        } else if (row.state === 'DUPLIKAT') {
          statusHtml = `<span class="status-text status-telat"><i class="bi bi-arrow-repeat"></i>Sudah Ada</span>`;
        } else {
          statusHtml = `<span class="status-text status-error"><i class="bi bi-x-circle"></i>${escapeHtml(row.reason)}</span>`;
        }

        return `
          <tr>
            <td class="mono-text text-secondary">${row.rowNumber}</td>
            <td class="mono-text fw-semibold">${escapeHtml(row.uid || '-')}</td>
            <td>${escapeHtml(row.namaTampil || '-')}</td>
            <td class="mono-text tabular-nums">${escapeHtml(row.tanggal || '-')}</td>
            <td class="mono-text tabular-nums">${escapeHtml(row.jamMasuk || '-')}</td>
            <td class="mono-text tabular-nums">${escapeHtml(row.jamPulang || '-')}</td>
            <td>${statusHtml}</td>
          </tr>
        `;
      })
      .join('');

    btnConfirm?.classList.remove('d-none');
    btnReset?.classList.remove('d-none');
    duplicateBox?.classList.remove('d-none');
  }

  function processWorkbookFile(file) {
    resetAlerts();

    if (!window.XLSX) {
      showError('Pustaka SheetJS (XLSX) belum termuat. Periksa koneksi internet Anda.');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      showError('Format file tidak didukung. Harap unggah file .xlsx, .xls, atau .csv.');
      return;
    }

    if (fileNameLabel) fileNameLabel.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        let workbook;
        if (ext === 'csv') {
          const text = new TextDecoder('utf-8').decode(new Uint8Array(evt.target.result));
          const firstLine = text.split(/\r?\n/)[0] || '';
          const fsChar = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
          workbook = window.XLSX.read(text, { type: 'string', FS: fsChar });
        } else {
          const data = new Uint8Array(evt.target.result);
          workbook = window.XLSX.read(data, { type: 'array' });
        }
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          showError('File Excel tidak memiliki lembar kerja (sheet).');
          return;
        }

        const sheet = workbook.Sheets[firstSheetName];
        const rawRows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const jsonRows = rawRows.filter((row) =>
          Object.values(row).some((val) => String(val ?? '').trim() !== '')
        );

        if (!Array.isArray(jsonRows) || jsonRows.length === 0) {
          showError('File Excel kosong atau tidak memiliki baris data.');
          return;
        }

        const headers = Object.keys(jsonRows[0]);
        const colUid = findColumnKey(headers, ['uid rfid', 'uid', 'rfid', 'kartu']);
        const colNama = findColumnKey(headers, ['nama guru', 'nama']);
        const colTanggal = findColumnKey(headers, ['tanggal', 'tgl', 'date']);
        const colMasuk = findColumnKey(headers, ['jam masuk', 'masuk', 'waktu masuk']);
        const colPulang = findColumnKey(headers, ['jam pulang', 'pulang', 'waktu pulang']);

        if (!colUid || !colTanggal) {
          showError(
            'Format Excel tidak sesuai. Kolom wajib "UID RFID" dan "Tanggal" tidak ditemukan. Gunakan tombol Download Template Excel sebagai acuan.'
          );
          return;
        }

        const existingAbsensi = getAllAbsensi();
        const seenInFile = new Set();

        parsedRows = jsonRows.map((raw, idx) => {
          const rowNumber = idx + 2;
          const uid = normalizeUid(raw[colUid]);
          const namaExcel = colNama ? String(raw[colNama] || '').trim() : '';
          const tanggal = parseExcelDate(raw[colTanggal]);
          const jamMasuk = colMasuk ? parseExcelTime(raw[colMasuk]) : '';
          const jamPulang = colPulang ? parseExcelTime(raw[colPulang]) : '';

          if (!uid) {
            return {
              rowNumber,
              uid: '',
              namaTampil: namaExcel,
              tanggal,
              jamMasuk,
              jamPulang,
              state: 'ERROR',
              reason: 'UID RFID kosong',
            };
          }

          if (!tanggal) {
            return {
              rowNumber,
              uid,
              namaTampil: namaExcel,
              tanggal: String(raw[colTanggal] || ''),
              jamMasuk,
              jamPulang,
              state: 'ERROR',
              reason: 'Format tanggal tidak valid',
            };
          }

          const guru = findGuruByUid(uid);
          if (!guru) {
            return {
              rowNumber,
              uid,
              namaTampil: namaExcel || 'Tidak Terdaftar',
              tanggal,
              jamMasuk,
              jamPulang,
              state: 'ERROR',
              reason: 'UID belum terdaftar di Data Guru',
            };
          }

          if (!jamMasuk && !jamPulang) {
            return {
              rowNumber,
              uid,
              namaTampil: guru.nama,
              tanggal,
              jamMasuk,
              jamPulang,
              state: 'ERROR',
              reason: 'Jam masuk & pulang kosong',
            };
          }

          const fileKey = `${tanggal}_${guru.id}`;
          if (seenInFile.has(fileKey)) {
            return {
              rowNumber,
              uid,
              namaTampil: guru.nama,
              tanggal,
              jamMasuk,
              jamPulang,
              state: 'ERROR',
              reason: 'Duplikat di dalam file Excel',
            };
          }
          seenInFile.add(fileKey);

          const exists = existingAbsensi.some(
            (a) => a.tanggal === tanggal && (a.guruId === guru.id || normalizeUid(a.uid) === uid)
          );

          return {
            rowNumber,
            uid: guru.uid,
            guru,
            namaTampil: guru.nama,
            tanggal,
            jamMasuk,
            jamPulang,
            state: exists ? 'DUPLIKAT' : 'BARU',
            reason: exists ? 'Data tanggal ini sudah tersimpan' : '',
          };
        });

        renderPreviewTable();
      } catch (err) {
        showError(`Gagal membaca file Excel: ${err?.message || 'Format rusak.'}`);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function confirmImportToLocalStorage() {
    if (parsedRows.length === 0) return;

    const policy =
      document.querySelector('input[name="duplicatePolicy"]:checked')?.value || 'update';
    const settings = getSettings();
    const allAbsensi = getAllAbsensi();

    let importedNew = 0;
    let updatedExisting = 0;
    let failedOrSkipped = 0;

    for (const row of parsedRows) {
      if (row.state === 'ERROR' || !row.guru) {
        failedOrSkipped++;
        continue;
      }

      const existingIdx = allAbsensi.findIndex(
        (a) =>
          a.tanggal === row.tanggal &&
          (a.guruId === row.guru.id || normalizeUid(a.uid) === row.uid)
      );

      if (existingIdx === -1) {
        const evalMasuk = row.jamMasuk
          ? evaluasiStatusMasuk(row.jamMasuk, settings)
          : { statusMasuk: 'Tepat Waktu', keterangan: 'Diimpor dari Excel' };

        const statusAkhir = row.jamPulang ? 'Sudah Pulang' : evalMasuk.statusMasuk;
        const keterangan = row.jamPulang
          ? `Masuk ${evalMasuk.statusMasuk} · Sudah absen pulang (Excel)`
          : `${evalMasuk.keterangan} (Excel)`;

        allAbsensi.unshift({
          id: `abs_${row.tanggal}_${row.guru.id}`,
          guruId: row.guru.id,
          uid: row.guru.uid,
          nama: row.guru.nama,
          nip: row.guru.nip,
          jabatan: row.guru.jabatan,
          kelas: row.guru.kelas,
          tanggal: row.tanggal,
          jamMasuk: row.jamMasuk,
          jamPulang: row.jamPulang,
          statusMasuk: evalMasuk.statusMasuk,
          statusAkhir,
          keterangan,
          sumber: 'Import Excel',
        });
        importedNew++;
      } else {
        if (policy === 'skip') {
          failedOrSkipped++;
          continue;
        }

        const existing = allAbsensi[existingIdx];
        let changed = false;

        let nextJamMasuk = existing.jamMasuk;
        let nextStatusMasuk = existing.statusMasuk;
        if (!nextJamMasuk && row.jamMasuk) {
          nextJamMasuk = row.jamMasuk;
          nextStatusMasuk = evaluasiStatusMasuk(row.jamMasuk, settings).statusMasuk;
          changed = true;
        }

        let nextJamPulang = existing.jamPulang;
        if (!nextJamPulang && row.jamPulang) {
          nextJamPulang = row.jamPulang;
          changed = true;
        } else if (row.jamPulang && nextJamPulang) {
          // Hanya perbarui jika jam pulang di Excel lebih baru atau sesuai kebutuhan pembaruan
          const oldSec = timeToSeconds(nextJamPulang) || 0;
          const newSec = timeToSeconds(row.jamPulang) || 0;
          if (newSec > oldSec) {
            nextJamPulang = row.jamPulang;
            changed = true;
          }
        }

        if (changed) {
          const statusAkhir = nextJamPulang ? 'Sudah Pulang' : nextStatusMasuk;
          allAbsensi[existingIdx] = {
            ...existing,
            jamMasuk: nextJamMasuk,
            jamPulang: nextJamPulang,
            statusMasuk: nextStatusMasuk,
            statusAkhir,
            keterangan: nextJamPulang
              ? `Masuk ${nextStatusMasuk} · Diperbarui dari Excel`
              : existing.keterangan,
          };
          updatedExisting++;
        } else {
          failedOrSkipped++;
        }
      }
    }

    saveAllAbsensi(allAbsensi);
    callbacks.onImportCompleted?.();

    const totalBerhasil = importedNew + updatedExisting;
    if (resultAlert) {
      resultAlert.innerHTML = `
        <strong>Proses Import Selesai:</strong>
        ${importedNew} data baru diimpor, ${updatedExisting} data diperbarui, dan ${failedOrSkipped} baris gagal/dilewati.
      `;
      resultAlert.classList.remove('d-none');
    }

    callbacks.showToast?.(
      `Import Excel selesai: ${totalBerhasil} data berhasil diproses, ${failedOrSkipped} gagal/dilewati.`,
      totalBerhasil > 0 ? 'success' : 'warning'
    );

    btnConfirm?.classList.add('d-none');
  }

  function downloadTemplateExcel() {
    if (!window.XLSX) {
      callbacks.showToast?.('Pustaka SheetJS (XLSX) belum tersedia.', 'danger');
      return;
    }

    const today = getTodayISO().split('-').reverse().join('/');
    const templateData = [
      {
        'UID RFID': 'A1B2C3D4',
        'Nama Guru': 'Drs. H. Ahmad Fauzi, M.Pd.',
        Tanggal: today,
        'Jam Masuk': '06:55',
        'Jam Pulang': '14:05',
      },
      {
        'UID RFID': 'E5F6G7H8',
        'Nama Guru': 'Siti Aminah, S.Pd.',
        Tanggal: today,
        'Jam Masuk': '07:20',
        'Jam Pulang': '14:10',
      },
      {
        'UID RFID': '99AABBCC',
        'Nama Guru': 'Rizky Pratama, S.Or.',
        Tanggal: today,
        'Jam Masuk': '06:50',
        'Jam Pulang': '14:00',
      },
    ];

    const ws = window.XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Template Absensi');
    window.XLSX.writeFile(wb, 'Template_Import_Absensi_Guru_SD.xlsx');
    callbacks.showToast?.('Template Excel berhasil diunduh.', 'success');
  }

  btnSelectFile?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) processWorkbookFile(file);
  });

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) processWorkbookFile(file);
  });

  btnDownloadTemplate?.addEventListener('click', downloadTemplateExcel);
  btnConfirm?.addEventListener('click', confirmImportToLocalStorage);
  btnReset?.addEventListener('click', resetPreview);

  return {
    resetPreview,
  };
}
