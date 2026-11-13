// ============================================================================
// js/laporan.js - Rekapitulasi Harian, Mingguan, Bulanan & Export Excel/CSV
// ============================================================================

import { escapeHtml, getActiveGuru, getTodayISO } from './guru.js';
import { getAllAbsensi, getSettings, getStatusCssClass, getStatusIcon } from './absensi.js';

function getWeekRangeISO(dateStr) {
  const parts = dateStr.split('-').map(Number);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  const day = dt.getDay(); // 0=Min, 1=Sen ... 6=Sab
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(dt);
  monday.setDate(dt.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return { start: fmt(monday), end: fmt(sunday) };
}

export function initLaporanUI(callbacks = {}) {
  const periodeSelect = document.getElementById('laporanPeriode');
  const tanggalWrap = document.getElementById('laporanTanggalWrap');
  const bulanWrap = document.getElementById('laporanBulanWrap');
  const tanggalInput = document.getElementById('laporanTanggal');
  const bulanInput = document.getElementById('laporanBulan');
  const guruFilterInput = document.getElementById('laporanGuruFilter');
  const statusFilterSelect = document.getElementById('laporanStatusFilter');

  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnPrint = document.getElementById('btnPrintLaporan');
  const btnDownload = document.getElementById('btnDownloadLaporan');

  const today = getTodayISO();
  if (tanggalInput && !tanggalInput.value) tanggalInput.value = today;
  if (bulanInput && !bulanInput.value) bulanInput.value = today.slice(0, 7);

  let currentRows = [];
  let currentPeriodeText = '';

  function getFilteredRows() {
    const periode = periodeSelect?.value || 'harian';
    const selectedDate = tanggalInput?.value || getTodayISO();
    const selectedMonth = bulanInput?.value || getTodayISO().slice(0, 7);
    const guruQuery = (guruFilterInput?.value || '').trim().toLowerCase();
    const statusVal = statusFilterSelect?.value || 'semua';

    const allAbsensi = getAllAbsensi();
    let rows = [];

    if (periode === 'harian') {
      currentPeriodeText = `Rekap Harian (${selectedDate})`;
      const dayRecords = allAbsensi.filter((a) => a.tanggal === selectedDate);
      const byGuruId = new Map(dayRecords.map((r) => [r.guruId, r]));

      // Gabungkan guru aktif agar guru yang Belum Hadir pada tanggal tsb tetap terlihat
      const activeGuru = getActiveGuru();
      rows = activeGuru.map((g) => {
        const rec = byGuruId.get(g.id);
        if (!rec) {
          return {
            tanggal: selectedDate,
            guruId: g.id,
            nama: g.nama,
            nip: g.nip,
            kelas: g.kelas,
            jamMasuk: '-',
            jamPulang: '-',
            status: 'Belum Hadir',
            keterangan: 'Tidak ada catatan scan',
          };
        }
        return {
          tanggal: rec.tanggal,
          guruId: rec.guruId,
          nama: rec.nama,
          nip: rec.nip,
          kelas: rec.kelas,
          jamMasuk: rec.jamMasuk || '-',
          jamPulang: rec.jamPulang || '-',
          status: rec.jamPulang ? 'Sudah Pulang' : rec.statusMasuk || 'Tepat Waktu',
          keterangan: rec.keterangan || '-',
        };
      });

      // Sertakan juga catatan non-guru-aktif jika ada di log
      for (const rec of dayRecords) {
        if (!activeGuru.some((g) => g.id === rec.guruId)) {
          rows.push({
            tanggal: rec.tanggal,
            guruId: rec.guruId,
            nama: rec.nama,
            nip: rec.nip,
            kelas: rec.kelas,
            jamMasuk: rec.jamMasuk || '-',
            jamPulang: rec.jamPulang || '-',
            status: rec.jamPulang ? 'Sudah Pulang' : rec.statusMasuk || 'Tepat Waktu',
            keterangan: rec.keterangan || '-',
          });
        }
      }
    } else if (periode === 'mingguan') {
      const range = getWeekRangeISO(selectedDate);
      currentPeriodeText = `Rekap Mingguan (${range.start} s/d ${range.end})`;
      rows = allAbsensi
        .filter((a) => a.tanggal >= range.start && a.tanggal <= range.end)
        .map((rec) => ({
          tanggal: rec.tanggal,
          guruId: rec.guruId,
          nama: rec.nama,
          nip: rec.nip,
          kelas: rec.kelas,
          jamMasuk: rec.jamMasuk || '-',
          jamPulang: rec.jamPulang || '-',
          status: rec.jamPulang ? 'Sudah Pulang' : rec.statusMasuk || 'Tepat Waktu',
          keterangan: rec.keterangan || '-',
        }));
    } else {
      currentPeriodeText = `Rekap Bulanan (${selectedMonth})`;
      rows = allAbsensi
        .filter((a) => String(a.tanggal || '').startsWith(selectedMonth))
        .map((rec) => ({
          tanggal: rec.tanggal,
          guruId: rec.guruId,
          nama: rec.nama,
          nip: rec.nip,
          kelas: rec.kelas,
          jamMasuk: rec.jamMasuk || '-',
          jamPulang: rec.jamPulang || '-',
          status: rec.jamPulang ? 'Sudah Pulang' : rec.statusMasuk || 'Tepat Waktu',
          keterangan: rec.keterangan || '-',
        }));
    }

    rows = rows.filter((r) => {
      const matchGuru =
        !guruQuery ||
        r.nama.toLowerCase().includes(guruQuery) ||
        String(r.nip).toLowerCase().includes(guruQuery);
      const matchStatus = statusVal === 'semua' || r.status === statusVal;
      return matchGuru && matchStatus;
    });

    rows.sort((a, b) => (a.tanggal === b.tanggal ? a.nama.localeCompare(b.nama) : b.tanggal.localeCompare(a.tanggal)));
    return rows;
  }

  function renderLaporan() {
    const periode = periodeSelect?.value || 'harian';
    if (periode === 'bulanan') {
      tanggalWrap?.classList.add('d-none');
      bulanWrap?.classList.remove('d-none');
    } else {
      tanggalWrap?.classList.remove('d-none');
      bulanWrap?.classList.add('d-none');
    }

    currentRows = getFilteredRows();

    const totalEl = document.getElementById('lapStatTotal');
    const tepatEl = document.getElementById('lapStatTepat');
    const telatEl = document.getElementById('lapStatTelat');
    const pulangEl = document.getElementById('lapStatPulang');
    const infoEl = document.getElementById('laporanPeriodeInfo');
    const tbody = document.getElementById('laporanTableBody');

    const countTepat = currentRows.filter((r) => r.status === 'Tepat Waktu').length;
    const countTelat = currentRows.filter((r) => r.status === 'Terlambat').length;
    const countPulang = currentRows.filter((r) => r.status === 'Sudah Pulang').length;

    if (totalEl) totalEl.textContent = String(currentRows.length);
    if (tepatEl) tepatEl.textContent = String(countTepat);
    if (telatEl) telatEl.textContent = String(countTelat);
    if (pulangEl) pulangEl.textContent = String(countPulang);
    if (infoEl) infoEl.textContent = currentPeriodeText;

    // Sinkronkan header cetak
    const settings = getSettings();
    const printSchool = document.getElementById('printSchoolName');
    const printAddr = document.getElementById('printSchoolAddress');
    const printSub = document.getElementById('printReportSubtitle');
    const printAt = document.getElementById('printGeneratedAt');
    if (printSchool) printSchool.textContent = settings.namaSekolah;
    if (printAddr) printAddr.textContent = settings.alamatSekolah;
    if (printSub) printSub.textContent = `Laporan Absensi Guru - ${currentPeriodeText}`;
    if (printAt) printAt.textContent = new Date().toLocaleString('id-ID');

    if (!tbody) return;

    if (currentRows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-secondary py-5">
            Tidak ada data absensi untuk filter yang dipilih.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = currentRows
      .map((r) => {
        const cls = getStatusCssClass(r.status);
        const icon = getStatusIcon(r.status);
        return `
          <tr>
            <td class="mono-text tabular-nums">${escapeHtml(r.tanggal)}</td>
            <td class="fw-semibold text-dark">${escapeHtml(r.nama)}</td>
            <td class="mono-text tabular-nums text-secondary">${escapeHtml(r.nip)}</td>
            <td>${escapeHtml(r.kelas)}</td>
            <td class="mono-text tabular-nums">${escapeHtml(r.jamMasuk)}</td>
            <td class="mono-text tabular-nums">${escapeHtml(r.jamPulang)}</td>
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

  function exportExcel() {
    if (!window.XLSX) {
      callbacks.showToast?.('Pustaka SheetJS (XLSX) belum tersedia.', 'danger');
      return;
    }
    if (currentRows.length === 0) {
      callbacks.showToast?.('Tidak ada data untuk diekspor.', 'warning');
      return;
    }

    const exportData = currentRows.map((r, i) => ({
      No: i + 1,
      Tanggal: r.tanggal,
      'ID Guru': r.guruId,
      'Nama Guru': r.nama,
      NIP: r.nip,
      'Kelas / Bagian': r.kelas,
      'Jam Masuk': r.jamMasuk,
      'Jam Pulang': r.jamPulang,
      Status: r.status,
      Keterangan: r.keterangan,
    }));

    const ws = window.XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 5 },
      { wch: 12 },
      { wch: 10 },
      { wch: 28 },
      { wch: 20 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 30 },
    ];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Laporan Absensi');
    const filename = `Laporan_Absensi_${periodeSelect?.value || 'harian'}_${getTodayISO()}.xlsx`;
    window.XLSX.writeFile(wb, filename);
    callbacks.showToast?.(`File Excel "${filename}" berhasil diekspor.`, 'success');
  }

  function exportCsv() {
    if (currentRows.length === 0) {
      callbacks.showToast?.('Tidak ada data untuk diekspor ke CSV.', 'warning');
      return;
    }

    const headers = ['No', 'Tanggal', 'ID Guru', 'Nama Guru', 'NIP', 'Kelas/Bagian', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan'];
    const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const lines = [headers.map(escapeCsv).join(',')];
    currentRows.forEach((r, idx) => {
      lines.push(
        [
          idx + 1,
          r.tanggal,
          r.guruId,
          r.nama,
          r.nip,
          r.kelas,
          r.jamMasuk,
          r.jamPulang,
          r.status,
          r.keterangan,
        ]
          .map(escapeCsv)
          .join(',')
      );
    });

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_Absensi_${periodeSelect?.value || 'harian'}_${getTodayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    callbacks.showToast?.('File CSV berhasil diunduh.', 'success');
  }

  function downloadRingkasanLaporan() {
    if (!window.XLSX) {
      callbacks.showToast?.('Pustaka SheetJS (XLSX) belum tersedia.', 'danger');
      return;
    }
    if (currentRows.length === 0) {
      callbacks.showToast?.('Tidak ada data untuk diunduh.', 'warning');
      return;
    }

    // Buat sheet Rekap Per Guru + sheet Detail
    const rekapMap = new Map();
    for (const r of currentRows) {
      if (!rekapMap.has(r.guruId)) {
        rekapMap.set(r.guruId, {
          'ID Guru': r.guruId,
          'Nama Guru': r.nama,
          NIP: r.nip,
          'Kelas / Bagian': r.kelas,
          'Total Hadir': 0,
          'Tepat Waktu': 0,
          Terlambat: 0,
          'Sudah Pulang': 0,
          'Belum Hadir': 0,
        });
      }
      const item = rekapMap.get(r.guruId);
      if (r.status === 'Belum Hadir') {
        item['Belum Hadir']++;
      } else {
        item['Total Hadir']++;
        if (r.status === 'Tepat Waktu') item['Tepat Waktu']++;
        if (r.status === 'Terlambat') item.Terlambat++;
        if (r.status === 'Sudah Pulang') item['Sudah Pulang']++;
      }
    }

    const rekapList = Array.from(rekapMap.values());
    const detailList = currentRows.map((r, i) => ({
      No: i + 1,
      Tanggal: r.tanggal,
      'Nama Guru': r.nama,
      NIP: r.nip,
      'Jam Masuk': r.jamMasuk,
      'Jam Pulang': r.jamPulang,
      Status: r.status,
      Keterangan: r.keterangan,
    }));

    const wb = window.XLSX.utils.book_new();
    const wsRekap = window.XLSX.utils.json_to_sheet(rekapList);
    const wsDetail = window.XLSX.utils.json_to_sheet(detailList);
    window.XLSX.utils.book_append_sheet(wb, wsRekap, 'Rekap Per Guru');
    window.XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Kehadiran');
    window.XLSX.writeFile(wb, `Rekap_Lengkap_Absensi_${getTodayISO()}.xlsx`);
    callbacks.showToast?.('Laporan rekap lengkap berhasil diunduh.', 'success');
  }

  periodeSelect?.addEventListener('change', renderLaporan);
  tanggalInput?.addEventListener('change', renderLaporan);
  bulanInput?.addEventListener('change', renderLaporan);
  guruFilterInput?.addEventListener('input', renderLaporan);
  statusFilterSelect?.addEventListener('change', renderLaporan);

  btnExportExcel?.addEventListener('click', exportExcel);
  btnExportCsv?.addEventListener('click', exportCsv);
  btnPrint?.addEventListener('click', () => {
    renderLaporan();
    window.print();
  });
  btnDownload?.addEventListener('click', downloadRingkasanLaporan);

  renderLaporan();

  return {
    renderLaporan,
  };
}
