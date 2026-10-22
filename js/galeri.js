/**
 * KIA LAUNDRY — Galeri Pakaian Logic
 * Menampilkan katalog pakaian berfoto dengan pencarian real-time,
 * filter status & layanan, kalkulasi hari keterlambatan, dan modal detail foto resolusi penuh.
 */

let allPakaianData = [];
let allTransaksiData = [];

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("galeri");
  renderFooter();

  try {
    await initDB();
    await loadGaleriData();
    setupGaleriFilters();
  } catch (err) {
    console.error("Gagal memuat galeri pakaian:", err);
    showToast("Gagal memuat galeri pakaian.", "error");
  }
});

// Memuat data pakaian dan transaksi pendukung
async function loadGaleriData() {
  allTransaksiData = await db.transaksi.toArray();
  allPakaianData = await db.pakaian.toArray();

  renderGaleriList(allPakaianData);
}

// Render grid kartu pakaian
function renderGaleriList(list) {
  const container = document.getElementById("galeriContainer");
  const countBadge = document.getElementById("galeriCountBadge");

  if (countBadge) {
    countBadge.textContent = `${list.length} Pakaian Ditemukan`;
  }

  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </div>
        <h3>Tidak Ada Pakaian Sesuai Filter</h3>
        <p>Coba sesuaikan kata kunci pencarian atau ubah opsi filter di atas.</p>
      </div>
    `;
    return;
  }

  const now = new Date();

  container.innerHTML = list
    .map((p) => {
      const trx = allTransaksiData.find((t) => t.id === p.transaksiId) || {};
      const status = trx.status || "masuk";

      // Hitung apakah lewat estimasi / lewat hari
      let overdueBadge = "";
      if (trx.estimasiSelesai && status !== "diambil") {
        const estDate = new Date(trx.estimasiSelesai);
        if (estDate < now) {
          const diffDays = Math.max(1, Math.floor((now - estDate) / (1000 * 60 * 60 * 24)));
          overdueBadge = `<div class="pakaian-overdue-tag">Lewat ${diffDays} Hari</div>`;
        }
      }

      const photoSrc = p.fotoThumb || p.foto || "../assets/icon.svg";

      return `
        <div class="pakaian-card" onclick="openPakaianDetail('${p.id}')">
          <div class="pakaian-photo-container">
            <img src="${photoSrc}" alt="${p.jenis}" loading="lazy">
            <div class="pakaian-floating-status">
              ${getStatusBadge(status)}
            </div>
            ${overdueBadge}
          </div>

          <div class="pakaian-body">
            <div class="pakaian-title">
              <span>${p.jenis}</span>
              <span style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">${p.jumlah} pcs</span>
            </div>

            <div class="pakaian-customer">
              ${trx.namaCustomer || 'Customer'} • <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted);">${trx.noHp || '-'}</span>
            </div>

            <div style="font-size:0.825rem; color:var(--text-body); margin-bottom:0.25rem;">
              Warna: <strong>${p.warna || '-'}</strong> ${p.merek ? `• Merek: ${p.merek}` : ''}
            </div>

            <div class="pakaian-kondisi-box">
              <strong>Kondisi:</strong> ${p.kondisi || 'Baik tanpa catatan cacat'}
            </div>

            <div class="pakaian-meta-footer">
              <span>Nota: <strong>${p.transaksiId}</strong></span>
              <span>${formatTanggal(p.createdAt || trx.tanggalMasuk)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

// Setup Event Filter & Search
function setupGaleriFilters() {
  const searchInput = document.getElementById("searchPakaianInput");
  const filterStatus = document.getElementById("filterStatus");
  const filterLayanan = document.getElementById("filterLayanan");
  const filterOverdue = document.getElementById("filterOverdue");

  const applyFilters = () => {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const status = filterStatus?.value || "all";
    const layanan = filterLayanan?.value || "all";
    const overdueOnly = filterOverdue?.value === "overdue";
    const now = new Date();

    const filtered = allPakaianData.filter((p) => {
      const trx = allTransaksiData.find((t) => t.id === p.transaksiId) || {};

      // Filter Status
      if (status !== "all" && trx.status !== status) return false;

      // Filter Layanan
      if (layanan !== "all" && trx.layanan !== layanan) return false;

      // Filter Overdue
      if (overdueOnly) {
        if (!trx.estimasiSelesai || trx.status === "diambil") return false;
        if (new Date(trx.estimasiSelesai) >= now) return false;
      }

      // Filter Search Keyword
      if (q) {
        const matchesQ =
          (p.jenis && p.jenis.toLowerCase().includes(q)) ||
          (p.warna && p.warna.toLowerCase().includes(q)) ||
          (p.merek && p.merek.toLowerCase().includes(q)) ||
          (p.kondisi && p.kondisi.toLowerCase().includes(q)) ||
          (p.transaksiId && p.transaksiId.toLowerCase().includes(q)) ||
          (trx.namaCustomer && trx.namaCustomer.toLowerCase().includes(q)) ||
          (trx.noHp && trx.noHp.includes(q));

        if (!matchesQ) return false;
      }

      return true;
    });

    renderGaleriList(filtered);
  };

  if (searchInput) searchInput.addEventListener("input", applyFilters);
  if (filterStatus) filterStatus.addEventListener("change", applyFilters);
  if (filterLayanan) filterLayanan.addEventListener("change", applyFilters);
  if (filterOverdue) filterOverdue.addEventListener("change", applyFilters);
}

// Buka Modal Detail Pakaian & Foto Resolusi Penuh
async function openPakaianDetail(pakaianId) {
  const p = allPakaianData.find((item) => item.id === pakaianId);
  if (!p) return;

  const trx = allTransaksiData.find((t) => t.id === p.transaksiId) || {};
  const settings = (await db.pengaturan.get("app")) || {};

  const fullPhoto = p.foto || p.fotoThumb || "../assets/icon.svg";
  const waUrl = `https://wa.me/62${(trx.noHp || '').replace(/^0/, '')}?text=Halo%20Kak%20${encodeURIComponent(
    trx.namaCustomer || ''
  )},%20kami%20dari%20KIA%20Laundry%20terkait%20pakaian%20${encodeURIComponent(p.jenis)}%20(${p.warna})%20No%20Nota%20${p.transaksiId}.`;

  const modalHtml = `
    <div style="text-align:center;">
      <img src="${fullPhoto}" alt="${p.jenis}" class="modal-photo-detail">
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem; font-size:0.9rem;">
      <div style="background:#f8fafc; padding:0.85rem; border-radius:10px; border:1px solid #e2e8f0;">
        <div style="font-size:0.75rem; text-transform:uppercase; color:#64748b; font-weight:700;">Informasi Pakaian</div>
        <div style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:0.25rem 0;">${p.jenis}</div>
        <div>Warna: <strong>${p.warna || '-'}</strong></div>
        <div>Merek: <strong>${p.merek || '-'}</strong></div>
        <div>Jumlah: <strong>${p.jumlah || 1} pcs</strong></div>
      </div>

      <div style="background:#f8fafc; padding:0.85rem; border-radius:10px; border:1px solid #e2e8f0;">
        <div style="font-size:0.75rem; text-transform:uppercase; color:#64748b; font-weight:700;">Data Transaksi & Pemilik</div>
        <div style="font-size:1.1rem; font-weight:800; color:#0284c7; margin:0.25rem 0;">${trx.namaCustomer || '-'}</div>
        <div>WhatsApp: <strong>${trx.noHp || '-'}</strong></div>
        <div>Nota: <strong>${p.transaksiId}</strong></div>
        <div style="margin-top:0.35rem;">${getStatusBadge(trx.status || 'masuk')}</div>
      </div>
    </div>

    <div style="background:#fffbeb; border-left:4px solid #f59e0b; padding:0.85rem; border-radius:6px; font-size:0.9rem; margin-bottom:1rem;">
      <strong style="color:#92400e;">Catatan Kondisi Awal Saat Masuk:</strong>
      <div style="margin-top:0.25rem; color:#78350f;">${p.kondisi || 'Kondisi baik & normal tanpa noda/kerusakan.'}</div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:#64748b; border-top:1px solid #e2e8f0; padding-top:0.75rem;">
      <span>Tanggal Masuk: ${formatTanggal(trx.tanggalMasuk, true)}</span>
      <span>Target Selesai: ${formatTanggal(trx.estimasiSelesai, true)}</span>
    </div>
  `;

  showModal(
    `Detail Pakaian — ${p.jenis}`,
    modalHtml,
    [
      {
        label: "Chat WhatsApp Pemilik",
        className: "btn-success",
        onClick: () => window.open(waUrl, "_blank")
      },
      {
        label: "Cetak Nota Transaksi",
        className: "btn-outline-primary",
        onClick: async () => {
          const pakaianTrx = allPakaianData.filter((item) => item.transaksiId === p.transaksiId);
          cetakNotaStruk(trx, pakaianTrx, settings);
        }
      },
      {
        label: "Tutup",
        className: "btn-outline",
        onClick: (close) => close()
      }
    ]
  );
}
