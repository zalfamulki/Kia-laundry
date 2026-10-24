/**
 * KIA LAUNDRY — Laporan & Export Logic
 * Memfilter transaksi & pakaian berdasarkan rentang tanggal/status/layanan,
 * menyajikan ringkasan omzet, pratinjau foto per nota, dan mengekspor ke
 * Excel Opsi A (ZIP foto) & Opsi B (Foto tertanam).
 */

let masterTrx = [];
let masterPkn = [];
let filteredTrx = [];
let filteredPkn = [];
let pknByTrx = new Map();
let defaultFilterDates = { start: "", end: "" };
let activeFotoNota = [];

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("laporan");
  renderFooter();

  try {
    await initDB();
    setupDefaultFilterDates();
    setupLaporanEventListeners();
    await loadLaporanData();
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

  defaultFilterDates = { start: firstDay, end: today };

  const elStart = document.getElementById("filterDateStart");
  const elEnd = document.getElementById("filterDateEnd");

  if (elStart) elStart.value = firstDay;
  if (elEnd) elEnd.value = today;
}

async function loadLaporanData() {
  masterTrx = (await db.transaksi.toArray()).filter((t) => !t.deletedAt);
  masterPkn = await db.pakaian.toArray();

  await updateTrashBadge();
  applyLaporanFilters();
}

async function updateTrashBadge() {
  const badge = document.getElementById("trashCountBadge");
  if (!badge) return;

  const deleted = await getDeletedTransaksi();
  badge.textContent = String(deleted.length);
  badge.hidden = deleted.length === 0;

  const btn = document.getElementById("btnOpenTrash");
  if (btn) {
    btn.title = deleted.length
      ? `${deleted.length} transaksi di Sampah — bisa dipulihkan`
      : "Sampah kosong";
  }
}

function applyLaporanFilters() {
  const startVal = document.getElementById("filterDateStart")?.value || "";
  const endVal = document.getElementById("filterDateEnd")?.value || "";
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

  const validTrxIds = new Set(filteredTrx.map((t) => t.id));
  filteredPkn = masterPkn.filter((p) => validTrxIds.has(p.transaksiId));
  pknByTrx = groupPakaianByTrx(filteredPkn);

  updateLaporanSummary();
  renderLaporanTable();
  updateFilterBadge();
}

// Kelompokkan pakaian per transaksi sekali saja (hindari pencarian berulang)
function groupPakaianByTrx(list) {
  const map = new Map();

  for (const p of list) {
    if (!map.has(p.transaksiId)) map.set(p.transaksiId, []);
    map.get(p.transaksiId).push(p);
  }

  return map;
}

function updateLaporanSummary() {
  const countTrx = filteredTrx.length;
  const countPcs = filteredPkn.reduce((sum, p) => sum + (Number(p.jumlah) || 1), 0);
  const totalOmzet = filteredTrx.reduce((sum, t) => sum + (Number(t.totalHarga) || 0), 0);

  const belumBayar = filteredTrx
    .filter((t) => t.statusBayar === "belum")
    .reduce((sum, t) => sum + (Number(t.totalHarga) || 0), 0);

  const elCountTrx = document.getElementById("sumCountTrx");
  const elCountPcs = document.getElementById("sumCountPcs");
  const elOmzet = document.getElementById("sumTotalOmzet");
  const elBelum = document.getElementById("sumBelumBayar");

  if (elCountTrx) elCountTrx.textContent = countTrx;
  if (elCountPcs) elCountPcs.textContent = countPcs;
  if (elOmzet) elOmzet.textContent = formatRupiah(totalOmzet);
  if (elBelum) elBelum.textContent = formatRupiah(belumBayar);
}

function renderLaporanTable() {
  const tbody = document.getElementById("laporanTableBody");
  if (!tbody) return;

  if (filteredTrx.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:2.5rem; color:#64748b;">
          Tidak ada data transaksi yang cocok dengan periode dan kriteria filter ini.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredTrx
    .map((t, idx) => {
      const items = pknByTrx.get(t.id) || [];
      const totalPcs = items.reduce((acc, p) => acc + (Number(p.jumlah) || 1), 0);

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(t.id)}</strong></td>
          <td>${formatTanggal(t.tanggalMasuk, true)}</td>
          <td>
            <strong>${escapeHtml(t.namaCustomer)}</strong>
            <div style="font-size:0.78rem; color:#64748b;">${escapeHtml(t.noHp)}</div>
          </td>
          <td>
            <span class="pill-service">${escapeHtml(formatLayanan(t.layanan))}</span>
          </td>
          <td>${totalPcs} Pcs ${t.berat ? `(${escapeHtml(t.berat)} Kg)` : ''}</td>
          <td>
            <div style="font-weight:800; color:var(--text-main);">${formatRupiah(t.totalHarga)}</div>
            <div>${getBayarBadge(t.statusBayar)}</div>
          </td>
          <td>${getStatusBadge(t.status)}</td>
          <td>${renderFotoCell(t.id, items)}</td>
          <td>${renderAksiCell(t)}</td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".js-open-foto-nota").forEach((btn) => {
    btn.addEventListener("click", () => openFotoNota(btn.getAttribute("data-trx-id")));
  });
  tbody.querySelectorAll(".js-mark-lunas").forEach((btn) => {
    btn.addEventListener("click", () => markTransaksiLunas(btn.getAttribute("data-trx-id")));
  });
  tbody.querySelectorAll(".js-edit-trx").forEach((btn) => {
    btn.addEventListener("click", () => openEditTransaksi(btn.getAttribute("data-trx-id")));
  });
  tbody.querySelectorAll(".js-delete-trx").forEach((btn) => {
    btn.addEventListener("click", () => softDeleteDariLaporan(btn.getAttribute("data-trx-id")));
  });
}

function renderAksiCell(trx) {
  const lunasButton =
    trx.statusBayar !== "lunas"
      ? `<button type="button" class="btn btn-sm btn-success js-mark-lunas" data-trx-id="${escapeHtml(trx.id)}" title="Tandai pembayaran lunas">Lunas</button>`
      : "";

  return `
    <div class="row-actions">
      ${lunasButton}
      <button type="button" class="btn btn-sm btn-outline-primary js-edit-trx" data-trx-id="${escapeHtml(trx.id)}" title="Edit status, pembayaran, total, dan catatan">Edit</button>
      <button type="button" class="btn btn-sm btn-danger js-delete-trx" data-trx-id="${escapeHtml(trx.id)}" title="Pindahkan transaksi ke Sampah">Hapus</button>
    </div>
  `;
}

// ======================================================
// Task 3 — Edit & hapus transaksi, ubah status pembayaran
// ======================================================

async function markTransaksiLunas(trxId) {
  const trx = masterTrx.find((t) => t.id === trxId);
  if (!trx) {
    showToast("Data transaksi tidak ditemukan.", "error");
    return;
  }

  if (trx.statusBayar === "lunas") {
    showToast("Transaksi ini sudah lunas.", "info");
    return;
  }

  if (!confirm(`Tandai pembayaran transaksi ${trxId} (${trx.namaCustomer}) sebagai LUNAS?`)) {
    return;
  }

  try {
    await db.transaksi.update(trxId, {
      statusBayar: "lunas",
      updatedAt: new Date().toISOString()
    });
    showToast(`Pembayaran ${trxId} berhasil ditandai lunas.`, "success");
    await loadLaporanData();
  } catch (err) {
    console.error("Gagal mengubah status pembayaran:", err);
    showToast("Gagal mengubah status pembayaran: " + err.message, "error");
  }
}

function openEditTransaksi(trxId) {
  const trx = masterTrx.find((t) => t.id === trxId);
  if (!trx) {
    showToast("Data transaksi tidak ditemukan.", "error");
    return;
  }

  const statusOptions = [
    ["masuk", "Masuk"],
    ["dicuci", "Dicuci"],
    ["disetrika", "Disetrika"],
    ["siap", "Siap Antar/Ambil"],
    ["diambil", "Sudah Diambil"]
  ];

  const bayarOptions = [
    ["belum", "Belum Bayar"],
    ["dp", "DP (Uang Muka)"],
    ["lunas", "Lunas"]
  ];

  const statusHtml = statusOptions
    .map(
      ([value, label]) =>
        `<option value="${value}" ${(trx.status || "masuk") === value ? "selected" : ""}>${label}</option>`
    )
    .join("");

  const bayarHtml = bayarOptions
    .map(
      ([value, label]) =>
        `<option value="${value}" ${(trx.statusBayar || "belum") === value ? "selected" : ""}>${label}</option>`
    )
    .join("");

  const contentHtml = `
    <div class="edit-trx-info">
      <div><span>No. Nota</span><strong>${escapeHtml(trx.id)}</strong></div>
      <div><span>Pelanggan</span><strong>${escapeHtml(trx.namaCustomer || "-")}</strong></div>
      <div><span>No. WhatsApp</span><strong>${escapeHtml(trx.noHp || "-")}</strong></div>
    </div>

    <div class="edit-form-grid">
      <div class="form-group">
        <label class="form-label" for="editTrxStatus">Status Cucian</label>
        <select id="editTrxStatus" class="form-select">${statusHtml}</select>
      </div>

      <div class="form-group">
        <label class="form-label" for="editTrxStatusBayar">Status Pembayaran</label>
        <select id="editTrxStatusBayar" class="form-select">${bayarHtml}</select>
      </div>

      <div class="form-group">
        <label class="form-label" for="editTrxTotal">Total Harga (Rp)</label>
        <input type="number" id="editTrxTotal" class="form-control" min="0" step="500" value="${Number(trx.totalHarga) || 0}">
      </div>

      <div class="form-group">
        <label class="form-label" for="editTrxCatatan">Catatan</label>
        <input type="text" id="editTrxCatatan" class="form-control" maxlength="500" value="${escapeHtml(trx.catatan || "")}" placeholder="Catatan transaksi (opsional)">
      </div>
    </div>

    <p class="form-help" style="margin-top:0.75rem;">
      Perubahan status di sini adalah koreksi admin. Perubahan status pembayaran tidak mengubah total belanja customer.
    </p>
  `;

  showModal(
    `Edit Transaksi — ${escapeHtml(trx.id)}`,
    contentHtml,
    [
      {
        label: "Simpan Perubahan",
        className: "btn-primary",
        onClick: async (close) => {
          const status = document.getElementById("editTrxStatus")?.value;
          const statusBayar = document.getElementById("editTrxStatusBayar")?.value;
          const totalHarga = Number(document.getElementById("editTrxTotal")?.value);
          const catatan = document.getElementById("editTrxCatatan")?.value.trim() || "";

          if (!statusOptions.some(([value]) => value === status)) {
            showToast("Status cucian tidak valid.", "warning");
            return;
          }

          if (!bayarOptions.some(([value]) => value === statusBayar)) {
            showToast("Status pembayaran tidak valid.", "warning");
            return;
          }

          if (!Number.isFinite(totalHarga) || totalHarga < 0) {
            showToast("Total harga harus berupa angka 0 atau lebih.", "warning");
            return;
          }

          if (catatan.length > 500) {
            showToast("Catatan maksimal 500 karakter.", "warning");
            return;
          }

          const now = new Date().toISOString();
          const changes = {
            status,
            statusBayar,
            totalHarga,
            catatan,
            updatedAt: now
          };

          if (status === "diambil" && !trx.diambilAt) {
            changes.diambilAt = now;
          }

          try {
            await db.transaksi.update(trxId, changes);
            await recalcCustomerStats(trx.noHp);
            await loadLaporanData();
            close();
            showToast(`Transaksi ${trxId} berhasil diperbarui.`, "success");
          } catch (err) {
            console.error("Gagal memperbarui transaksi:", err);
            showToast("Gagal memperbarui transaksi: " + err.message, "error");
          }
        }
      },
      {
        label: "Batal",
        className: "btn-outline",
        onClick: (close) => close()
      }
    ]
  );
}

async function softDeleteDariLaporan(trxId) {
  const trx = masterTrx.find((t) => t.id === trxId);
  if (!trx) {
    showToast("Data transaksi tidak ditemukan.", "error");
    return;
  }

  const firstConfirm = confirm(
    `Hapus transaksi ${trxId} (${trx.namaCustomer})?\n\nData akan dipindahkan ke Sampah dan masih bisa dipulihkan selama 30 hari.`
  );
  if (!firstConfirm) return;

  const typed = prompt(`Ketik nomor nota "${trxId}" untuk konfirmasi penghapusan:`);
  if (typed === null) return;

  if (typed.trim() !== trxId) {
    showToast("Nomor nota tidak cocok. Penghapusan dibatalkan.", "warning");
    return;
  }

  try {
    await softDeleteTransaksi(trxId);
    showToast(`Transaksi ${trxId} dipindahkan ke Sampah.`, "success");
    await loadLaporanData();
  } catch (err) {
    console.error("Gagal menghapus transaksi:", err);
    showToast("Gagal menghapus transaksi: " + err.message, "error");
  }
}

function renderFotoCell(trxId, items) {
  const fotoItems = items.filter(hasFoto);

  if (fotoItems.length === 0) {
    return `<span class="foto-empty">Tanpa foto</span>`;
  }

  return `
    <button type="button" class="btn btn-sm btn-outline-primary js-open-foto-nota" data-trx-id="${escapeHtml(trxId)}">
      Lihat Foto (${fotoItems.length})
    </button>
  `;
}

function hasFoto(p) {
  return Boolean(p && (p.foto || p.fotoThumb));
}

function formatLayanan(layanan) {
  const key = String(layanan || "").toLowerCase();
  const labels = {
    cuci: "Cuci",
    setrika: "Setrika",
    "cuci-setrika": "Cuci + Setrika",
    satuan: "Satuan"
  };

  return labels[key] || layanan || "-";
}

// Buka satu modal berisi semua pakaian pada satu nota
function openFotoNota(trxId) {
  const trx = masterTrx.find((t) => t.id === trxId);
  if (!trx) {
    showToast("Data transaksi tidak ditemukan.", "error");
    return;
  }

  const items = pknByTrx.get(trxId) || masterPkn.filter((p) => p.transaksiId === trxId);
  activeFotoNota = items;

  const totalPcs = items.reduce((sum, p) => sum + (Number(p.jumlah) || 1), 0);
  const fotoCount = items.filter(hasFoto).length;

  const cardsHtml = items
    .map((p, idx) => {
      const thumbHtml = hasFoto(p)
        ? `<button type="button" class="foto-nota-thumb js-foto-zoom" data-foto-index="${idx}" title="Perbesar foto ${escapeHtml(p.jenis)}">
             <img src="${p.fotoThumb || p.foto}" alt="Foto ${escapeHtml(p.jenis)}" loading="lazy">
           </button>`
        : `<div class="foto-nota-thumb is-empty">Foto belum tersedia</div>`;

      return `
        <div class="foto-nota-card">
          ${thumbHtml}
          <div class="foto-nota-card-body">
            <div class="foto-nota-title">
              <span>${escapeHtml(p.jenis || "-")}</span>
              <span class="foto-nota-qty">${Number(p.jumlah) || 1} pcs</span>
            </div>
            <div class="foto-nota-detail">
              Warna: <strong>${escapeHtml(p.warna || "-")}</strong>
              ${p.merek ? ` • Merek: <strong>${escapeHtml(p.merek)}</strong>` : ""}
            </div>
            <div class="foto-nota-kondisi">
              <strong>Kondisi:</strong> ${escapeHtml(p.kondisi || "Baik tanpa catatan cacat")}
            </div>
            <div class="foto-nota-card-actions">
              <button type="button" class="btn btn-sm btn-outline-primary js-edit-pkn" data-pkn-id="${escapeHtml(p.id)}">Edit</button>
              <button type="button" class="btn btn-sm btn-danger js-delete-pkn" data-pkn-id="${escapeHtml(p.id)}">Hapus</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const contentHtml = `
    <div class="foto-nota-header">
      <div>
        <div class="foto-nota-customer">${escapeHtml(trx.namaCustomer || "-")}</div>
        <div class="foto-nota-meta">
          ${escapeHtml(trx.noHp || "-")} • Nota ${escapeHtml(trx.id)} • ${formatTanggal(trx.tanggalMasuk, true)}
        </div>
      </div>
      <div>${getStatusBadge(trx.status || "masuk")}</div>
    </div>

    <div class="foto-nota-summary">
      <div>
        <div class="foto-nota-summary-label">Layanan</div>
        <div class="foto-nota-summary-value">${escapeHtml(formatLayanan(trx.layanan))}</div>
      </div>
      <div>
        <div class="foto-nota-summary-label">Total Pakaian</div>
        <div class="foto-nota-summary-value">${totalPcs} Pcs</div>
      </div>
      <div>
        <div class="foto-nota-summary-label">Foto Tersedia</div>
        <div class="foto-nota-summary-value">${fotoCount} dari ${items.length} item</div>
      </div>
      <div>
        <div class="foto-nota-summary-label">Total Harga</div>
        <div class="foto-nota-summary-value">${formatRupiah(trx.totalHarga)}</div>
      </div>
    </div>

    ${
      items.length
        ? `<div class="foto-nota-grid">${cardsHtml}</div>`
        : `<div class="foto-nota-empty">Belum ada rincian pakaian untuk nota ini.</div>`
    }
  `;

  const waUrl = buildWhatsAppUrl(trx);

  showModal(
    `Dokumentasi Foto — ${escapeHtml(trx.id)}`,
    contentHtml,
    [
      {
        label: "Chat WhatsApp Pelanggan",
        className: "btn-success",
        onClick: () => {
          if (!waUrl) {
            showToast("Nomor WhatsApp pelanggan belum tersedia.", "warning");
            return;
          }
          window.open(waUrl, "_blank");
        }
      },
      {
        label: "Cetak Nota Transaksi",
        className: "btn-outline-primary",
        onClick: async () => {
          const settings = (await db.pengaturan.get("app")) || {};
          cetakNotaStruk(trx, items, settings);
        }
      },
      {
        label: "Tutup",
        className: "btn-outline",
        onClick: (close) => close()
      }
    ],
    { size: "lg" }
  );

  document.querySelectorAll(".js-foto-zoom").forEach((btn) => {
    btn.addEventListener("click", () => {
      openFotoLightbox(Number(btn.getAttribute("data-foto-index")));
    });
  });

  document.querySelectorAll(".js-edit-pkn").forEach((btn) => {
    btn.addEventListener("click", () => openEditPakaian(btn.getAttribute("data-pkn-id")));
  });

  document.querySelectorAll(".js-delete-pkn").forEach((btn) => {
    btn.addEventListener("click", () => deletePakaianItem(btn.getAttribute("data-pkn-id")));
  });
}

// ======================================================
// Task 3 — Edit & hapus item pakaian
// ======================================================

function openEditPakaian(pknId) {
  const p = masterPkn.find((item) => item.id === pknId);
  if (!p) {
    showToast("Data pakaian tidak ditemukan.", "error");
    return;
  }

  const thumb = p.fotoThumb || p.foto;
  const previewHtml = thumb
    ? `<img src="${thumb}" alt="Foto ${escapeHtml(p.jenis || "pakaian")}" class="edit-pkn-preview">`
    : `<div class="edit-pkn-preview is-empty">Belum ada foto</div>`;

  const contentHtml = `
    <div class="edit-form-grid">
      <div class="form-group">
        <label class="form-label" for="editPknJenis">Jenis Pakaian</label>
        <input type="text" id="editPknJenis" class="form-control" value="${escapeHtml(p.jenis || "")}" maxlength="80">
      </div>

      <div class="form-group">
        <label class="form-label" for="editPknWarna">Warna</label>
        <input type="text" id="editPknWarna" class="form-control" value="${escapeHtml(p.warna || "")}" maxlength="60">
      </div>

      <div class="form-group">
        <label class="form-label" for="editPknMerek">Merek</label>
        <input type="text" id="editPknMerek" class="form-control" value="${escapeHtml(p.merek || "")}" maxlength="80">
      </div>

      <div class="form-group">
        <label class="form-label" for="editPknJumlah">Jumlah (pcs)</label>
        <input type="number" id="editPknJumlah" class="form-control" min="1" step="1" value="${Number(p.jumlah) || 1}">
      </div>

      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label" for="editPknKondisi">Kondisi</label>
        <input type="text" id="editPknKondisi" class="form-control" value="${escapeHtml(p.kondisi || "")}" maxlength="120">
      </div>
    </div>

    <div class="edit-pkn-photo">
      <div class="form-label">Foto Item</div>
      ${previewHtml}
      <input type="file" id="editPknFoto" class="form-control" accept="image/*" style="margin-top:0.6rem;">
      <label class="edit-pkn-remove-photo">
        <input type="checkbox" id="editPknHapusFoto">
        Hapus foto saat ini
      </label>
      <p class="form-help">Pilih file baru untuk mengganti foto. Foto akan dikompres otomatis.</p>
    </div>
  `;

  showModal(
    `Edit Pakaian — ${escapeHtml(p.jenis || "Item")}`,
    contentHtml,
    [
      {
        label: "Simpan Perubahan",
        className: "btn-primary",
        onClick: async (close) => {
          const jenis = document.getElementById("editPknJenis")?.value.trim() || "";
          const warna = document.getElementById("editPknWarna")?.value.trim() || "-";
          const merek = document.getElementById("editPknMerek")?.value.trim() || "";
          const jumlah = parseInt(document.getElementById("editPknJumlah")?.value, 10);
          const kondisi = document.getElementById("editPknKondisi")?.value.trim() || "Kondisi baik";
          const hapusFoto = Boolean(document.getElementById("editPknHapusFoto")?.checked);
          const fileInput = document.getElementById("editPknFoto");
          const file = fileInput && fileInput.files ? fileInput.files[0] : null;

          if (!jenis) {
            showToast("Jenis pakaian wajib diisi.", "warning");
            return;
          }

          if (!Number.isFinite(jumlah) || jumlah < 1) {
            showToast("Jumlah pakaian minimal 1 pcs.", "warning");
            return;
          }

          const changes = {
            jenis,
            warna: warna || "-",
            merek,
            jumlah,
            kondisi
          };

          try {
            if (file) {
              if (typeof KameraManager === "undefined") {
                showToast("Modul kamera tidak termuat. Muat ulang halaman.", "error");
                return;
              }
              const compressed = await KameraManager.compressImage(file);
              changes.foto = compressed.foto;
              changes.fotoThumb = compressed.fotoThumb;
              changes.fotoPurgedAt = null;
            } else if (hapusFoto) {
              changes.foto = null;
              changes.fotoThumb = null;
              changes.fotoPurgedAt = null;
            }

            await db.pakaian.update(pknId, changes);
            await db.transaksi.update(p.transaksiId, { updatedAt: new Date().toISOString() });

            await loadLaporanData();
            close();
            openFotoNota(p.transaksiId);
            showToast("Data pakaian berhasil diperbarui.", "success");
          } catch (err) {
            console.error("Gagal memperbarui pakaian:", err);
            showToast("Gagal memperbarui pakaian: " + err.message, "error");
          }
        }
      },
      {
        label: "Batal",
        className: "btn-outline",
        onClick: (close) => {
          close();
          openFotoNota(p.transaksiId);
        }
      }
    ]
  );

  const fileInput = document.getElementById("editPknFoto");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const hapusCheckbox = document.getElementById("editPknHapusFoto");
      if (fileInput.files && fileInput.files.length > 0 && hapusCheckbox) {
        hapusCheckbox.checked = false;
      }
    });
  }
}

async function deletePakaianItem(pknId) {
  const p = masterPkn.find((item) => item.id === pknId);
  if (!p) {
    showToast("Data pakaian tidak ditemukan.", "error");
    return;
  }

  if (!confirm(`Hapus item "${p.jenis || "pakaian"}" (${Number(p.jumlah) || 1} pcs) dari nota ${p.transaksiId}?`)) {
    return;
  }

  try {
    await db.pakaian.delete(pknId);
    await db.transaksi.update(p.transaksiId, { updatedAt: new Date().toISOString() });
    await loadLaporanData();

    closeModal();

    const remaining = masterPkn.filter((item) => item.transaksiId === p.transaksiId);
    if (remaining.length > 0) {
      openFotoNota(p.transaksiId);
    }

    showToast("Item pakaian berhasil dihapus.", "success");
  } catch (err) {
    console.error("Gagal menghapus pakaian:", err);
    showToast("Gagal menghapus pakaian: " + err.message, "error");
  }
}

function buildWhatsAppUrl(trx) {
  const phone = String(trx.noHp || "").replace(/\D/g, "").replace(/^0/, "");
  if (!phone) return "";

  const text = `Halo Kak ${trx.namaCustomer || ""}, kami dari KIA Laundry terkait cucian Anda dengan No. Nota ${trx.id}.`;
  return `https://wa.me/62${phone}?text=${encodeURIComponent(text)}`;
}

function openFotoLightbox(index) {
  const p = activeFotoNota[index];
  const src = p && (p.foto || p.fotoThumb);
  if (!src) return;

  const lightbox = document.getElementById("fotoLightbox");
  const img = document.getElementById("fotoLightboxImg");
  const caption = document.getElementById("fotoLightboxCaption");
  const closeBtn = document.getElementById("fotoLightboxClose");

  if (!lightbox || !img || !caption) return;

  img.src = src;
  img.alt = `Foto ${p.jenis || "pakaian"}`;
  caption.textContent = [
    p.jenis || "Pakaian",
    p.warna || "-",
    `${Number(p.jumlah) || 1} pcs`,
    p.kondisi ? `Kondisi: ${p.kondisi}` : ""
  ]
    .filter(Boolean)
    .join(" • ");

  lightbox.hidden = false;
  lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("foto-lightbox-open");

  requestAnimationFrame(() => {
    lightbox.classList.add("show");
    if (closeBtn) closeBtn.focus();
  });
}

function closeFotoLightbox() {
  const lightbox = document.getElementById("fotoLightbox");
  const img = document.getElementById("fotoLightboxImg");
  if (!lightbox || lightbox.hidden) return;

  lightbox.classList.remove("show");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("foto-lightbox-open");

  setTimeout(() => {
    if (lightbox.classList.contains("show")) return;
    lightbox.hidden = true;
    if (img) img.src = "";
  }, 200);
}

function updateFilterBadge() {
  const badge = document.getElementById("filterActiveBadge");
  if (!badge) return;

  const startVal = document.getElementById("filterDateStart")?.value || "";
  const endVal = document.getElementById("filterDateEnd")?.value || "";
  const statusVal = document.getElementById("filterStatusLaporan")?.value || "all";
  const bayarVal = document.getElementById("filterBayarLaporan")?.value || "all";
  const layananVal = document.getElementById("filterLayananLaporan")?.value || "all";

  let activeCount = 0;
  if (startVal !== defaultFilterDates.start) activeCount++;
  if (endVal !== defaultFilterDates.end) activeCount++;
  if (statusVal !== "all") activeCount++;
  if (bayarVal !== "all") activeCount++;
  if (layananVal !== "all") activeCount++;

  badge.textContent = String(activeCount);
  badge.hidden = activeCount === 0;
}

function setFilterPanelOpen(open) {
  const panel = document.getElementById("reportFilterPanel");
  const toggle = document.getElementById("btnToggleFilter");
  if (!panel || !toggle) return;

  panel.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.setAttribute(
    "aria-label",
    open ? "Sembunyikan filter laporan" : "Tampilkan filter laporan"
  );
  toggle.title = open ? "Sembunyikan filter" : "Filter laporan";
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

  const toggleBtn = document.getElementById("btnToggleFilter");
  const closeBtn = document.getElementById("btnCloseFilter");
  const resetBtn = document.getElementById("btnResetFilter");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const panel = document.getElementById("reportFilterPanel");
      setFilterPanelOpen(panel ? panel.hidden : false);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => setFilterPanelOpen(false));
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const elStart = document.getElementById("filterDateStart");
      const elEnd = document.getElementById("filterDateEnd");
      const elStatus = document.getElementById("filterStatusLaporan");
      const elBayar = document.getElementById("filterBayarLaporan");
      const elLayanan = document.getElementById("filterLayananLaporan");

      if (elStart) elStart.value = defaultFilterDates.start;
      if (elEnd) elEnd.value = defaultFilterDates.end;
      if (elStatus) elStatus.value = "all";
      if (elBayar) elBayar.value = "all";
      if (elLayanan) elLayanan.value = "all";

      applyLaporanFilters();
      showToast("Filter dikembalikan ke periode bulan ini.", "info");
    });
  }

  // Tutup panel saat klik di luar area filter
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("reportFilterPanel");
    const toggle = document.getElementById("btnToggleFilter");
    if (!panel || panel.hidden) return;
    if (panel.contains(e.target) || (toggle && toggle.contains(e.target))) return;
    setFilterPanelOpen(false);
  });

  // Lightbox
  const lightbox = document.getElementById("fotoLightbox");
  const lightboxClose = document.getElementById("fotoLightboxClose");

  if (lightbox) {
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeFotoLightbox();
    });
  }

  if (lightboxClose) {
    lightboxClose.addEventListener("click", closeFotoLightbox);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    const lb = document.getElementById("fotoLightbox");
    if (lb && !lb.hidden) {
      closeFotoLightbox();
      return;
    }

    const panel = document.getElementById("reportFilterPanel");
    if (panel && !panel.hidden) setFilterPanelOpen(false);
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

  // ======================================================
  // Task 2.1 — Tombol "Export & Bersihkan"
  // Setelah export ZIP sukses, tawarkan opsi hapus foto nota yang diarsipkan
  // ======================================================
  const btnExportBersihkan = document.getElementById("btnExportBersihkan");
  if (btnExportBersihkan) {
    btnExportBersihkan.addEventListener("click", async () => {
      const trxDenganFoto = filteredTrx.filter((t) => {
        const items = pknByTrx.get(t.id) || [];
        return items.some(hasFoto);
      });

      if (trxDenganFoto.length === 0) {
        showToast("Tidak ada nota dengan foto dalam periode filter ini.", "warning");
        return;
      }

      // Hitung estimasi foto dan MB yang akan dihapus
      let totalFoto = 0;
      let totalBytes = 0;

      for (const t of trxDenganFoto) {
        const items = pknByTrx.get(t.id) || [];
        for (const p of items) {
          if (p.foto) {
            totalFoto++;
            totalBytes += Math.round(p.foto.length * 0.75);
          }
          if (p.fotoThumb) {
            totalBytes += Math.round(p.fotoThumb.length * 0.75);
          }
        }
      }

      const estimasiMb = (totalBytes / (1024 * 1024)).toFixed(2);
      const trxIds = trxDenganFoto.map((t) => t.id);

      // Tampilkan dialog konfirmasi ringkasan
      const ringkasanHtml = `
        <div style="text-align:center; padding: 0.5rem 0 1rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🗑️</div>
          <p style="font-size: 1rem; color: var(--text-body); margin-bottom: 1.25rem;">
            Fitur ini akan <strong>menghapus foto pakaian</strong> dari <strong>${trxIds.length} nota</strong>
            dalam periode filter yang aktif saat ini.
          </p>
          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1.25rem;">
            <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 0.75rem 1.5rem; text-align:center;">
              <div style="font-size: 1.75rem; font-weight: 900; color: #92400e;">${totalFoto}</div>
              <div style="font-size: 0.8rem; color: #78350f;">Foto akan dihapus</div>
            </div>
            <div style="background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 10px; padding: 0.75rem 1.5rem; text-align:center;">
              <div style="font-size: 1.75rem; font-weight: 900; color: #14532d;">~${estimasiMb} MB</div>
              <div style="font-size: 0.8rem; color: #166534;">Estimasi dibebaskan</div>
            </div>
          </div>
          <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 0.875rem; font-size: 0.85rem; color: #9a3412; text-align:left; line-height:1.5;">
            ⚠️ <strong>Data teks transaksi dan pakaian tetap tersimpan.</strong><br>
            Hanya file foto yang dihapus dari penyimpanan browser.<br>
            Pastikan Anda sudah mengunduh ZIP sebelum melanjutkan.
          </div>
        </div>
      `;

      showModal(
        "Konfirmasi Hapus Foto Nota",
        ringkasanHtml,
        [
          {
            label: "Ya, Hapus Foto Sekarang",
            className: "btn-danger",
            onClick: async (close) => {
              try {
                btnExportBersihkan.disabled = true;
                showToast("Menghapus foto dari penyimpanan...", "info");
                const result = await purgeFotoNota(trxIds);
                showToast(
                  `Berhasil membebaskan ${result.estimasiMb} MB — ${result.fotoCount} foto dihapus dari ${trxIds.length} nota.`,
                  "success"
                );
                await loadLaporanData();
                close();
              } catch (err) {
                console.error("Gagal purge foto:", err);
                showToast("Gagal menghapus foto: " + err.message, "error");
              } finally {
                btnExportBersihkan.disabled = false;
              }
            }
          },
          {
            label: "Batal",
            className: "btn-outline",
            onClick: (close) => close()
          }
        ],
        { size: "md" }
      );
    });
  }
}
