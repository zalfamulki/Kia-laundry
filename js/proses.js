/**
 * KIA LAUNDRY — Monitoring Proses Status & Checklist Pakaian
 * Board aktif: Masuk -> Dicuci -> Disetrika -> Siap Antar/Ambil.
 * Transaksi selesai ditampilkan ringkas di tabel terpisah.
 */

const ACTIVE_STAGES = [
  { key: "masuk", title: "Masuk", next: "dicuci", nextLabel: "Cuci", nextClass: "btn-yellow" },
  { key: "dicuci", title: "Dicuci", next: "disetrika", nextLabel: "Setrika", nextClass: "btn-yellow" },
  { key: "disetrika", title: "Disetrika", next: "siap", nextLabel: "Tandai Siap", nextClass: "btn-yellow" },
  { key: "siap", title: "Siap Antar / Ambil", next: "diambil", nextLabel: "Serahkan", nextClass: "btn-primary" }
];

const SELESAI_PREVIEW_LIMIT = 10;

let allTrx = [];
let allPkn = [];
let pknByTrx = new Map();
let activeSettings = {};
let activeDetailItems = [];

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("proses");
  renderFooter();
  setupProsesLightbox();
  setupStageTabs();

  const btnAllSelesai = document.getElementById("btnLihatSemuaSelesai");
  if (btnAllSelesai) btnAllSelesai.addEventListener("click", openSelesaiSemuaModal);

  try {
    await initDB();
    await loadProsesBoard();
  } catch (err) {
    console.error("Gagal memuat papan proses:", err);
    showToast("Gagal memuat data proses.", "error");
  }
});

async function loadProsesBoard() {
  allTrx = (await db.transaksi.toArray()).filter((t) => !t.deletedAt);
  allPkn = await db.pakaian.toArray();
  activeSettings = (await db.pengaturan.get("app")) || {};

  pknByTrx = new Map();
  for (const p of allPkn) {
    if (!p.transaksiId) continue;
    if (!pknByTrx.has(p.transaksiId)) pknByTrx.set(p.transaksiId, []);
    pknByTrx.get(p.transaksiId).push(p);
  }

  for (const stage of ACTIVE_STAGES) {
    renderActiveStage(stage);
  }

  renderSelesaiTable();
}

function renderActiveStage(stage) {
  const stageTrx = allTrx
    .filter((t) => (t.status || "masuk") === stage.key)
    .sort((a, b) => getTime(a.tanggalMasuk || a.createdAt) - getTime(b.tanggalMasuk || b.createdAt));

  const badge = document.getElementById(`count_${stage.key}`);
  if (badge) badge.textContent = stageTrx.length;

  const tabBadge = document.getElementById(`tabCount_${stage.key}`);
  if (tabBadge) tabBadge.textContent = stageTrx.length;

  const container = document.getElementById(`col_${stage.key}`);
  if (!container) return;

  if (stageTrx.length === 0) {
    container.innerHTML = `<div class="kanban-empty">Tidak ada cucian di tahap ini</div>`;
    return;
  }

  container.innerHTML = stageTrx.map((trx) => renderProsesCard(trx, stage)).join("");
}

function renderProsesCard(trx, stage) {
  const items = getItems(trx.id);
  const metode = getMetodePenyerahan(trx);
  const metodeLabel = metode === "antar" ? "Antar" : "Ambil";
  const customerName = trx.namaCustomer || "Tanpa nama";

  const waButton =
    stage.key === "siap"
      ? `<button type="button" class="btn btn-sm btn-success proses-btn-wa" onclick="kirimWhatsApp('${escapeHtml(trx.id)}')" title="Kirim WhatsApp ke pelanggan">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
           <span>WhatsApp</span>
         </button>`
      : "";

  const nextButton = stage.next
    ? `<button type="button" class="btn btn-sm ${stage.nextClass} proses-btn-next" onclick="handleStageTransition('${escapeHtml(trx.id)}', '${stage.next}')">
         ${stage.nextLabel}
       </button>`
    : "";

  return `
    <article class="proses-card">
      <div class="proses-card-top">
        <div class="proses-card-main">
          <div class="proses-customer" title="${escapeHtml(customerName)}">${escapeHtml(customerName)}</div>
          <div class="proses-meta">
            <span class="proses-nota">${escapeHtml(trx.id)}</span>
            <span class="proses-dot">•</span>
            <span>${escapeHtml(formatLayananLabel(trx.layanan))}</span>
          </div>
        </div>
        <div class="proses-price">
          <strong>${formatRupiah(trx.totalHarga)}</strong>
        </div>
      </div>

      <div class="proses-card-sub">
        <span class="proses-method ${metode === "antar" ? "is-antar" : "is-ambil"}">${metodeLabel}</span>
        <span class="proses-items-count">${items.length} item</span>
      </div>

      <div class="proses-card-actions">
        <button type="button" class="btn btn-sm btn-outline-primary" onclick="openProsesDetail('${escapeHtml(trx.id)}')">
          Lihat Detail
        </button>
        ${waButton}
        ${nextButton}
      </div>
    </article>
  `;
}

function renderSelesaiTable() {
  const list = getSelesaiList();
  const countEl = document.getElementById("count_diambil");
  if (countEl) countEl.textContent = list.length;

  const btnAll = document.getElementById("btnLihatSemuaSelesai");
  if (btnAll) btnAll.disabled = list.length === 0;

  const tbody = document.getElementById("selesaiTableBody");
  if (!tbody) return;

  const latest = list.slice(0, SELESAI_PREVIEW_LIMIT);
  if (latest.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="selesai-empty">Belum ada cucian selesai.</td></tr>`;
    return;
  }

  tbody.innerHTML = latest
    .map(
      (trx, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><span class="nota-code">${escapeHtml(trx.id)}</span></td>
        <td class="selesai-customer" title="${escapeHtml(trx.namaCustomer || "")}">${escapeHtml(trx.namaCustomer || "-")}</td>
        <td>${formatTanggal(trx.diambilAt || trx.updatedAt || trx.tanggalMasuk, true)}</td>
        <td class="selesai-total">${formatRupiah(trx.totalHarga)}</td>
        <td>
          <div class="selesai-actions">
            ${
              trx.statusBayar !== "lunas"
                ? `<button type="button" class="btn btn-sm btn-outline-success" onclick="markProsesLunas('${escapeHtml(trx.id)}')" title="Tandai pembayaran lunas">Lunas</button>`
                : ""
            }
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="openProsesDetail('${escapeHtml(trx.id)}')">
              Lihat Detail
            </button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function getSelesaiList() {
  return allTrx
    .filter((trx) => (trx.status || "masuk") === "diambil")
    .sort(
      (a, b) =>
        getTime(b.diambilAt || b.updatedAt || b.tanggalMasuk) -
        getTime(a.diambilAt || a.updatedAt || a.tanggalMasuk)
    );
}

// Handler Perpindahan Status
async function handleStageTransition(trxId, nextStatus) {
  const trx = allTrx.find((t) => t.id === trxId);
  if (!trx) return;

  // Jika transisi ke "diambil", wajibkan checklist verifikasi fisik pakaian
  if (nextStatus === "diambil") {
    openChecklistModal(trx);
    return;
  }

  await db.transaksi.update(trxId, {
    status: nextStatus,
    updatedAt: new Date().toISOString()
  });

  const statusLabel = {
    dicuci: "Dicuci",
    disetrika: "Disetrika",
    siap: "Siap Antar / Ambil"
  }[nextStatus] || nextStatus;

  showToast(`Cucian ${trxId} dipindahkan ke status: ${statusLabel}`, "success");
  await loadProsesBoard();
}

// Task 3 — Ubah status pembayaran dari halaman Proses
async function markProsesLunas(trxId) {
  const trx = allTrx.find((t) => t.id === trxId);
  if (!trx) {
    showToast("Data transaksi tidak ditemukan.", "error");
    return false;
  }

  if (trx.statusBayar === "lunas") {
    showToast("Transaksi ini sudah lunas.", "info");
    return false;
  }

  if (!confirm(`Tandai pembayaran transaksi ${trxId} (${trx.namaCustomer}) sebagai LUNAS?`)) {
    return false;
  }

  try {
    await db.transaksi.update(trxId, {
      statusBayar: "lunas",
      jumlahDibayar: Number(trx.totalHarga) || 0,
      updatedAt: new Date().toISOString()
    });
    showToast(`Pembayaran ${trxId} berhasil ditandai lunas.`, "success");
    await loadProsesBoard();
    return true;
  } catch (err) {
    console.error("Gagal mengubah status pembayaran:", err);
    showToast("Gagal mengubah status pembayaran: " + err.message, "error");
    return false;
  }
}

// Modal Verifikasi Checklist Fisik Pakaian Sebelum Diserahkan
function openChecklistModal(trx) {
  const items = getItems(trx.id);

  if (items.length === 0) {
    if (confirm(`Serahkan cucian ${trx.id} kepada ${trx.namaCustomer}?`)) {
      finalizeSerahkanCucian(trx.id);
    }
    return;
  }

  const itemsHtml = items
    .map(
      (p, idx) => `
      <label class="checklist-item" id="checkLabel_${idx}">
        <input type="checkbox" class="checklist-checkbox pkn-check" data-index="${idx}">
        <img src="${p.fotoThumb || p.foto || "../assets/icon.svg"}" alt="Foto ${escapeHtml(p.jenis || "pakaian")}" style="width:44px; height:44px; object-fit:cover; border-radius:6px;">
        <div style="flex:1;">
          <div style="font-weight:800; font-size:0.9rem;">${Number(p.jumlah) || 1}x ${escapeHtml(p.jenis || "-")} (${escapeHtml(p.warna || "-")})</div>
          <div style="font-size:0.78rem; color:#64748b;">${p.kondisi ? `Kondisi: ${escapeHtml(p.kondisi)}` : "Kondisi baik"} ${p.merek ? `• Merek: ${escapeHtml(p.merek)}` : ""}</div>
        </div>
      </label>
    `
    )
    .join("");

  showModal(
    `Checklist Pakaian — ${escapeHtml(trx.id)}`,
    `
    <div style="margin-bottom:1rem;">
      <p style="font-size:0.9rem; color:#475569;">
        Centang setiap potong pakaian bersama pelanggan <strong>${escapeHtml(trx.namaCustomer || "-")}</strong> untuk memastikan tidak ada pakaian yang tertinggal atau tertukar:
      </p>
    </div>
    <div style="max-height:50vh; overflow-y:auto; margin-bottom:1rem;">
      ${itemsHtml}
    </div>
    <div class="checklist-payment">
      <div class="checklist-payment-row">
        <span>Total tagihan</span>
        <strong>${formatRupiah(getPaymentInfo(trx).total)}</strong>
      </div>
      <div class="checklist-payment-row">
        <span>Sudah dibayar</span>
        <strong>${formatRupiah(getPaymentInfo(trx).dibayar)}</strong>
      </div>
      <div class="checklist-payment-row is-sisa">
        <span>Sisa tagihan</span>
        <strong>${formatRupiah(getPaymentInfo(trx).sisa)}</strong>
      </div>
      <p class="checklist-payment-note">
        Status pembayaran tidak diubah di sini. Setelah cucian masuk tabel <strong>Selesai</strong>,
        pilih <strong>Lunas</strong> atau buka <strong>Lihat Detail</strong>.
      </p>
    </div>
    `,
    [
      {
        label: "Konfirmasi & Serahkan Cucian",
        className: "btn-success",
        onClick: async (close) => {
          const checkboxes = document.querySelectorAll(".pkn-check");
          const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

          if (!allChecked) {
            if (!confirm("Beberapa pakaian belum dicentang. Apakah Anda yakin semua fisik pakaian sudah sesuai?")) {
              return;
            }
          }

          await finalizeSerahkanCucian(trx.id);
          close();
        }
      },
      {
        label: "Batal",
        className: "btn-outline",
        onClick: (close) => close()
      }
    ],
    { size: "lg" }
  );

  document.querySelectorAll(".pkn-check").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const idx = e.target.getAttribute("data-index");
      const label = document.getElementById(`checkLabel_${idx}`);
      if (label) {
        if (e.target.checked) label.classList.add("checked");
        else label.classList.remove("checked");
      }
    });
  });
}

// Finalisasi Penyerahan Cucian
// Status pembayaran TIDAK diubah di sini; keputusan Lunas dilakukan dari tabel Selesai.
async function finalizeSerahkanCucian(trxId) {
  const now = new Date().toISOString();
  await db.transaksi.update(trxId, {
    status: "diambil",
    diambilAt: now,
    updatedAt: now
  });

  showToast(`Cucian ${trxId} resmi diserahkan kepada pelanggan!`, "success");
  await loadProsesBoard();
}

// Modal Lihat Detail Pesanan
function openProsesDetail(trxId) {
  const trx = allTrx.find((t) => t.id === trxId);
  if (!trx) {
    showToast("Data transaksi tidak ditemukan.", "error");
    return;
  }

  const items = getItems(trx.id);
  activeDetailItems = items;

  const totalPcs = items.reduce((sum, p) => sum + (Number(p.jumlah) || 1), 0);
  const fotoCount = items.filter(hasItemPhoto).length;
  const metode = getMetodePenyerahan(trx);
  const pay = getPaymentInfo(trx);

  const itemsHtml = items
    .map((p, idx) => {
      const thumbHtml = hasItemPhoto(p)
        ? `<button type="button" class="proses-detail-thumb js-proses-foto" data-foto-index="${idx}" title="Perbesar foto ${escapeHtml(p.jenis || "pakaian")}">
             <img src="${p.fotoThumb || p.foto}" alt="Foto ${escapeHtml(p.jenis || "pakaian")}" loading="lazy">
           </button>`
        : `<div class="proses-detail-thumb is-empty">Tanpa foto</div>`;

      return `
        <div class="proses-detail-item">
          ${thumbHtml}
          <div class="proses-detail-item-body">
            <div class="proses-detail-item-title">
              <span>${escapeHtml(p.jenis || "-")}</span>
              <span class="proses-detail-qty">${Number(p.jumlah) || 1} pcs</span>
            </div>
            <div class="proses-detail-item-meta">
              Warna: <strong>${escapeHtml(p.warna || "-")}</strong>
              ${p.merek ? ` • Merek: <strong>${escapeHtml(p.merek)}</strong>` : ""}
            </div>
            <div class="proses-detail-condition">
              <strong>Kondisi:</strong> ${escapeHtml(p.kondisi || "Baik tanpa catatan cacat")}
            </div>
            <div class="proses-detail-item-actions">
              ${
                hasItemPhoto(p)
                  ? `<button type="button" class="btn btn-sm btn-outline-danger js-proses-hapus-foto" data-pkn-id="${escapeHtml(p.id)}">Hapus Foto</button>`
                  : ""
              }
              <button type="button" class="btn btn-sm btn-danger js-proses-hapus-item" data-pkn-id="${escapeHtml(p.id)}">Hapus Item</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const contentHtml = `
    <div class="proses-detail-header">
      <div>
        <div class="proses-detail-customer">${escapeHtml(trx.namaCustomer || "-")}</div>
        <div class="proses-detail-meta">
          ${escapeHtml(trx.noHp || "-")} • Nota ${escapeHtml(trx.id)} • ${formatTanggal(trx.tanggalMasuk, true)}
        </div>
      </div>
      <div>${getStatusBadge(trx.status || "masuk")}</div>
    </div>

    <div class="proses-detail-summary">
      <div>
        <div class="proses-detail-label">Layanan</div>
        <div class="proses-detail-value">${escapeHtml(formatLayananLabel(trx.layanan))}</div>
      </div>
      <div>
        <div class="proses-detail-label">Total Pakaian</div>
        <div class="proses-detail-value">${totalPcs} Pcs</div>
      </div>
      <div>
        <div class="proses-detail-label">Total Harga</div>
        <div class="proses-detail-value">${formatRupiah(trx.totalHarga)}</div>
      </div>
      <div>
        <div class="proses-detail-label">Pembayaran</div>
        <div class="proses-detail-value">${getBayarBadge(trx.statusBayar)}</div>
      </div>
      <div>
        <div class="proses-detail-label">Sudah Dibayar</div>
        <div class="proses-detail-value">${formatRupiah(pay.dibayar)}</div>
      </div>
      <div>
        <div class="proses-detail-label">Sisa Tagihan</div>
        <div class="proses-detail-value" style="color:${pay.sisa > 0 ? "#b91c1c" : "#047857"};">${formatRupiah(pay.sisa)}</div>
      </div>
      <div>
        <div class="proses-detail-label">Metode</div>
        <div class="proses-detail-value">${metode === "antar" ? "Antar ke Alamat" : "Ambil di Toko"}</div>
      </div>
      <div>
        <div class="proses-detail-label">Estimasi Selesai</div>
        <div class="proses-detail-value">${formatTanggal(trx.estimasiSelesai, true)}</div>
      </div>
    </div>

    <div class="proses-detail-address">
      <div class="proses-detail-label">Alamat / Patokan</div>
      <div class="proses-detail-value">${escapeHtml(trx.alamat || "Belum diisi")}</div>
    </div>

    ${
      trx.catatan
        ? `<div class="proses-detail-note"><strong>Catatan:</strong> ${escapeHtml(trx.catatan)}</div>`
        : ""
    }

    <div class="proses-detail-section-title">
      <span>Rincian Pakaian</span>
      <span>${items.length} item • ${fotoCount} foto</span>
    </div>

    ${
      items.length
        ? `<div class="proses-detail-items">${itemsHtml}</div>`
        : `<div class="proses-detail-empty">Belum ada rincian pakaian untuk nota ini.</div>`
    }
  `;

  const buttons = [];

  if ((trx.status || "masuk") === "siap") {
    buttons.push({
      label: "Kirim WhatsApp",
      className: "btn-success",
      onClick: () => kirimWhatsApp(trx.id)
    });
  }

  if (trx.statusBayar !== "lunas") {
    buttons.push({
      label: "Tandai Lunas",
      className: "btn-outline-success",
      onClick: async (close) => {
        const updated = await markProsesLunas(trx.id);
        if (updated) close();
      }
    });
  }

  buttons.push({
    label: "Cetak Nota",
    className: "btn-outline-primary",
    onClick: async () => {
      const settings = activeSettings.namaLaundry
        ? activeSettings
        : (await db.pengaturan.get("app")) || {};
      cetakNotaStruk(trx, items, settings);
    }
  });

  buttons.push({
    label: "Tutup",
    className: "btn-outline",
    onClick: (close) => close()
  });

  showModal(`Detail Pesanan — ${escapeHtml(trx.id)}`, contentHtml, buttons, { size: "lg" });

  document.querySelectorAll(".js-proses-foto").forEach((btn) => {
    btn.addEventListener("click", () => {
      openProsesLightbox(Number(btn.getAttribute("data-foto-index")));
    });
  });

  document.querySelectorAll(".js-proses-hapus-foto").forEach((btn) => {
    btn.addEventListener("click", () => {
      hapusFotoItemProses(btn.getAttribute("data-pkn-id"), trx.id);
    });
  });

  document.querySelectorAll(".js-proses-hapus-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      hapusItemProses(btn.getAttribute("data-pkn-id"), trx.id);
    });
  });
}

// Task 4 — hapus foto/item langsung dari detail Proses
async function hapusFotoItemProses(pknId, trxId) {
  const item = getItems(trxId).find((p) => p.id === pknId);
  if (!item) {
    showToast("Item pakaian tidak ditemukan.", "error");
    return;
  }

  if (!confirm(`Hapus foto "${item.jenis || "pakaian"}"?\n\nData teks item tetap tersimpan, hanya fotonya yang dihapus.`)) {
    return;
  }

  try {
    await hapusFotoPakaian(pknId);
    await loadProsesBoard();
    closeModal();
    openProsesDetail(trxId);
    showToast("Foto item berhasil dihapus.", "success");
  } catch (err) {
    console.error("Gagal menghapus foto item:", err);
    showToast("Gagal menghapus foto: " + err.message, "error");
  }
}

async function hapusItemProses(pknId, trxId) {
  const item = getItems(trxId).find((p) => p.id === pknId);
  if (!item) {
    showToast("Item pakaian tidak ditemukan.", "error");
    return;
  }

  if (
    !confirm(
      `Hapus item "${item.jenis || "pakaian"}" (${Number(item.jumlah) || 1} pcs) dari nota ${trxId}?\n\nTindakan ini tidak bisa dibatalkan. Total harga transaksi tidak berubah otomatis.`
    )
  ) {
    return;
  }

  try {
    await hapusPakaianItem(pknId);
    await loadProsesBoard();
    closeModal();
    openProsesDetail(trxId);
    showToast("Item pakaian berhasil dihapus.", "success");
  } catch (err) {
    console.error("Gagal menghapus item pakaian:", err);
    showToast("Gagal menghapus item: " + err.message, "error");
  }
}

// Modal semua transaksi selesai
function openSelesaiSemuaModal() {
  const list = getSelesaiList();
  if (list.length === 0) {
    showToast("Belum ada cucian selesai.", "warning");
    return;
  }

  const rowsHtml = list
    .map(
      (trx, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><span class="nota-code">${escapeHtml(trx.id)}</span></td>
        <td>${escapeHtml(trx.namaCustomer || "-")}</td>
        <td>${formatTanggal(trx.diambilAt || trx.updatedAt || trx.tanggalMasuk, true)}</td>
        <td class="selesai-total">${formatRupiah(trx.totalHarga)}</td>
        <td>
          <div class="selesai-actions">
            ${
              trx.statusBayar !== "lunas"
                ? `<button type="button" class="btn btn-sm btn-outline-success js-lunas-selesai-modal" data-trx-id="${escapeHtml(trx.id)}" title="Tandai pembayaran lunas">Lunas</button>`
                : ""
            }
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="openProsesDetail('${escapeHtml(trx.id)}')">
              Lihat Detail
            </button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");

  showModal(
    `Semua Cucian Selesai (${list.length})`,
    `
    <div class="table-responsive" style="max-height:60vh; overflow:auto;">
      <table class="custom-table selesai-table">
        <thead>
          <tr>
            <th style="width: 42px;">No</th>
            <th>No. Nota</th>
            <th>Pelanggan</th>
            <th>Selesai</th>
            <th>Total</th>
            <th style="width: 165px;">Aksi</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    `,
    [
      {
        label: "Tutup",
        className: "btn-outline",
        onClick: (close) => close()
      }
    ],
    { size: "lg" }
  );

  document.querySelectorAll(".js-lunas-selesai-modal").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const updated = await markProsesLunas(btn.getAttribute("data-trx-id"));
      if (updated) {
        closeModal();
        openSelesaiSemuaModal();
      }
    });
  });
}

// WhatsApp ke pelanggan saat cucian siap
function kirimWhatsApp(trxId) {
  const trx = allTrx.find((t) => t.id === trxId);
  if (!trx) {
    showToast("Data transaksi tidak ditemukan.", "error");
    return;
  }

  if ((trx.status || "masuk") !== "siap") {
    showToast("WhatsApp hanya tersedia saat cucian berstatus siap.", "warning");
    return;
  }

  const url = buildProsesWaUrl(trx);
  if (!url) {
    showToast("Nomor WhatsApp pelanggan belum tersedia.", "warning");
    return;
  }

  window.open(url, "_blank", "noopener");
}

function buildProsesWaUrl(trx) {
  if (typeof buildWaUrl !== "function") return "";
  return buildWaUrl("siap", trx, activeSettings, getItems(trx.id));
}

function getMetodePenyerahan(trx) {
  return trx && trx.metodePenyerahan === "ambil" ? "ambil" : "antar";
}

function getItems(trxId) {
  return pknByTrx.get(trxId) || [];
}

function hasItemPhoto(p) {
  return Boolean(p && (p.foto || p.fotoThumb));
}

function getTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// Task 4 — tab tahap sticky untuk mobile
function setupStageTabs() {
  const tabs = Array.from(document.querySelectorAll(".proses-stage-tab"));
  if (tabs.length === 0) return;

  const setActive = (stageKey) => {
    tabs.forEach((tab) => {
      const active = tab.getAttribute("data-stage") === stageKey;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const stageKey = tab.getAttribute("data-stage");
      const column = document.querySelector(`.kanban-column[data-stage="${stageKey}"]`);
      setActive(stageKey);
      if (column) {
        column.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.getAttribute("data-stage"));
      },
      { rootMargin: "-130px 0px -55% 0px", threshold: [0, 0.25, 0.5] }
    );
    document.querySelectorAll(".kanban-column[data-stage]").forEach((col) => {
      observer.observe(col);
    });
  }
}

// Lightbox foto detail pesanan
function setupProsesLightbox() {
  const lightbox = document.getElementById("prosesLightbox");
  const closeBtn = document.getElementById("prosesLightboxClose");
  if (!lightbox) return;

  if (closeBtn) closeBtn.addEventListener("click", closeProsesLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeProsesLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!lightbox.hidden && lightbox.classList.contains("show")) {
      closeProsesLightbox();
      return;
    }
    closeModal();
  });
}

function openProsesLightbox(index) {
  const p = activeDetailItems[index];
  const src = p && (p.foto || p.fotoThumb);
  if (!src) return;

  const lightbox = document.getElementById("prosesLightbox");
  const img = document.getElementById("prosesLightboxImg");
  const caption = document.getElementById("prosesLightboxCaption");
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
  document.body.classList.add("proses-lightbox-open");

  requestAnimationFrame(() => {
    lightbox.classList.add("show");
    const closeBtn = document.getElementById("prosesLightboxClose");
    if (closeBtn) closeBtn.focus();
  });
}

function closeProsesLightbox() {
  const lightbox = document.getElementById("prosesLightbox");
  const img = document.getElementById("prosesLightboxImg");
  if (!lightbox || lightbox.hidden) return;

  lightbox.classList.remove("show");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("proses-lightbox-open");

  setTimeout(() => {
    if (lightbox.classList.contains("show")) return;
    lightbox.hidden = true;
    if (img) img.src = "";
  }, 200);
}
