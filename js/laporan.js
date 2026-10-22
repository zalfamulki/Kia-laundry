/**
 * KIA LAUNDRY — Laporan & Export Logic
 * Memfilter transaksi & pakaian berdasarkan rentang tanggal/status/layanan,
 * menyajikan ringkasan omzet, dan mengekspor ke Excel Opsi A (ZIP foto) & Opsi B (Foto tertanam).
 */

let masterTrx = [];
let masterPkn = [];
let filteredTrx = [];
let filteredPkn = [];

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("laporan");
  renderFooter();

  try {
    await initDB();
    setupDefaultFilterDates();
    await loadLaporanData();
    setupLaporanEventListeners();
  } catch (err) {
    console.error("Gagal inisialisasi laporan:", err);
    showToast("Gagal memuat data laporan.", "error");
  }
});

function setupDefaultFilterDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const firstDay = `${year}-${month}-01`;
  const today = `${year}-${month}-${day}`;

  const elStart = document.getElementById("filterDateStart");
  const elEnd = document.getElementById("filterDateEnd");

  if (elStart) elStart.value = firstDay;
  if (elEnd) elEnd.value = today;
}

async function loadLaporanData() {
  masterTrx = await db.transaksi.toArray();
  masterPkn = await db.pakaian.toArray();

  applyLaporanFilters();
}

function applyLaporanFilters() {
  const startVal = document.getElementById("filterDateStart")?.value;
  const endVal = document.getElementById("filterDateEnd")?.value;
  const statusVal = document.getElementById("filterStatusLaporan")?.value || "all";
  const bayarVal = document.getElementById("filterBayarLaporan")?.value || "all";
  const layananVal = document.getElementById("filterLayananLaporan")?.value || "all";

  filteredTrx = masterTrx.filter((t) => {
    // Tanggal filter
    if (t.tanggalMasuk) {
      const trxDate = t.tanggalMasuk.slice(0, 10);
      if (startVal && trxDate < startVal) return false;
      if (endVal && trxDate > endVal) return false;
    }

    // Status Cucian
    if (statusVal !== "all" && t.status !== statusVal) return false;

    // Status Bayar
    if (bayarVal !== "all" && t.statusBayar !== bayarVal) return false;

    // Layanan
    if (layananVal !== "all" && t.layanan !== layananVal) return false;

    return true;
  });

  const validTrxIds = filteredTrx.map((t) => t.id);
  filteredPkn = masterPkn.filter((p) => validTrxIds.includes(p.transaksiId));

  updateLaporanSummary();
  renderLaporanTable();
}

function updateLaporanSummary() {
  const countTrx = filteredTrx.length;
  const countPcs = filteredPkn.reduce((sum, p) => sum + (Number(p.jumlah) || 1), 0);
  const totalOmzet = filteredTrx.reduce((sum, t) => sum + (Number(t.totalHarga) || 0), 0);
  
  const belumBayar = filteredTrx
    .filter((t) => t.statusBayar === "belum")
    .reduce((sum, t) => sum + (Number(t.totalHarga) || 0), 0);

  document.getElementById("sumCountTrx").textContent = countTrx;
  document.getElementById("sumCountPcs").textContent = countPcs;
  document.getElementById("sumTotalOmzet").textContent = formatRupiah(totalOmzet);
  document.getElementById("sumBelumBayar").textContent = formatRupiah(belumBayar);
}

function renderLaporanTable() {
  const tbody = document.getElementById("laporanTableBody");
  if (!tbody) return;

  if (filteredTrx.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:2.5rem; color:#64748b;">
          Tidak ada data transaksi yang cocok dengan periode dan kriteria filter ini.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredTrx
    .map((t, idx) => {
      const items = filteredPkn.filter((p) => p.transaksiId === t.id);
      const totalPcs = items.reduce((acc, p) => acc + (Number(p.jumlah) || 1), 0);

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${t.id}</strong></td>
          <td>${formatTanggal(t.tanggalMasuk, true)}</td>
          <td>
            <strong>${t.namaCustomer}</strong>
            <div style="font-size:0.78rem; color:#64748b;">${t.noHp}</div>
          </td>
          <td>
            <span class="pill-service">${t.layanan.toUpperCase()}</span>
          </td>
          <td>${totalPcs} Pcs ${t.berat ? `(${t.berat} Kg)` : ''}</td>
          <td>
            <div style="font-weight:800; color:var(--text-main);">${formatRupiah(t.totalHarga)}</div>
            <div>${getBayarBadge(t.statusBayar)}</div>
          </td>
          <td>${getStatusBadge(t.status)}</td>
        </tr>
      `;
    })
    .join("");
}

function setupLaporanEventListeners() {
  const inputs = [
    "filterDateStart",
    "filterDateEnd",
    "filterStatusLaporan",
    "filterBayarLaporan",
    "filterLayananLaporan"
  ];

  inputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", applyLaporanFilters);
  });

  // Tombol Export Opsi A (XLSX + ZIP Foto)
  const btnExportA = document.getElementById("btnExportOpsiA");
  if (btnExportA) {
    btnExportA.addEventListener("click", async () => {
      if (filteredTrx.length === 0) {
        showToast("Tidak ada data untuk diekspor.", "warning");
        return;
      }

      try {
        showToast("Mempersiapkan XLSX dan mengompres folder foto ke ZIP...", "info");
        btnExportA.disabled = true;
        await ExportManager.exportZipXlsx(filteredTrx, filteredPkn);
        showToast("File ZIP (Excel + Folder Foto) berhasil diunduh!", "success");
      } catch (err) {
        console.error("Gagal export Opsi A:", err);
        showToast("Gagal melakukan export: " + err.message, "error");
      } finally {
        btnExportA.disabled = false;
      }
    });
  }

  // Tombol Export Opsi B (XLSX dengan Foto Tertanam di Sel)
  const btnExportB = document.getElementById("btnExportOpsiB");
  if (btnExportB) {
    btnExportB.addEventListener("click", async () => {
      if (filteredTrx.length === 0) {
        showToast("Tidak ada data untuk diekspor.", "warning");
        return;
      }

      try {
        showToast("Menyusun spreadsheet dengan gambar tertanam via ExcelJS...", "info");
        btnExportB.disabled = true;
        await ExportManager.exportEmbeddedPhotosXlsx(filteredTrx, filteredPkn);
        showToast("File Excel foto tertanam berhasil diunduh!", "success");
      } catch (err) {
        console.error("Gagal export Opsi B:", err);
        showToast("Gagal export ExcelJS: " + err.message, "error");
      } finally {
        btnExportB.disabled = false;
      }
    });
  }
}
