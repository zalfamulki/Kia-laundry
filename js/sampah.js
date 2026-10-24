/**
 * KIA LAUNDRY — Halaman Sampah (Task 3.4)
 * Menampilkan transaksi soft-deleted, memulihkan, dan menghapus permanen.
 * Data yang lebih tua dari 30 hari dibersihkan otomatis sekali per hari
 * melalui runTrashPurgeOncePerDay() di js/db.js.
 */

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("laporan");
  renderFooter();

  try {
    await initDB();
    await loadSampahData();
  } catch (err) {
    console.error("Gagal memuat halaman Sampah:", err);
    showToast("Gagal memuat data Sampah.", "error");
  }
});

async function loadSampahData() {
  const list = await getDeletedTransaksi();
  renderSampahTable(list);
}

function renderSampahTable(list) {
  const tbody = document.getElementById("sampahTableBody");
  const countEl = document.getElementById("sampahCount");
  if (countEl) countEl.textContent = String(list.length);

  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="sampah-empty">
          Sampah kosong. Transaksi yang dihapus dari Laporan akan muncul di sini.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list
    .map((trx, idx) => {
      const daysLeft = getSampahDaysLeft(trx.deletedAt);

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(trx.id)}</strong></td>
          <td>
            <strong>${escapeHtml(trx.namaCustomer || "-")}</strong>
            <div class="sampah-meta">${escapeHtml(trx.noHp || "-")}</div>
          </td>
          <td>${formatTanggal(trx.deletedAt, true)}</td>
          <td>
            <span class="trash-days ${daysLeft <= 3 ? "is-urgent" : ""}">
              ${daysLeft} hari
            </span>
          </td>
          <td class="sampah-total">${formatRupiah(trx.totalHarga)}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="btn btn-sm btn-success js-restore-trx" data-trx-id="${escapeHtml(trx.id)}">
                Pulihkan
              </button>
              <button type="button" class="btn btn-sm btn-danger js-hard-delete-trx" data-trx-id="${escapeHtml(trx.id)}">
                Hapus Permanen
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".js-restore-trx").forEach((btn) => {
    btn.addEventListener("click", () => restoreDariSampah(btn.getAttribute("data-trx-id")));
  });

  tbody.querySelectorAll(".js-hard-delete-trx").forEach((btn) => {
    btn.addEventListener("click", () => hardDeleteDariSampah(btn.getAttribute("data-trx-id")));
  });
}

function getSampahDaysLeft(deletedAt) {
  const deleted = new Date(deletedAt).getTime();
  if (Number.isNaN(deleted)) return 0;

  const elapsedDays = Math.floor((Date.now() - deleted) / (24 * 60 * 60 * 1000));
  return Math.max(0, TRASH_RETENTION_DAYS - elapsedDays);
}

async function restoreDariSampah(trxId) {
  if (!confirm(`Pulihkan transaksi ${trxId} ke Laporan?`)) return;

  try {
    await restoreTransaksi(trxId);
    showToast(`Transaksi ${trxId} berhasil dipulihkan.`, "success");
    await loadSampahData();
  } catch (err) {
    console.error("Gagal memulihkan transaksi:", err);
    showToast("Gagal memulihkan transaksi: " + err.message, "error");
  }
}

async function hardDeleteDariSampah(trxId) {
  const firstConfirm = confirm(
    `Hapus permanen transaksi ${trxId}?\n\nSeluruh item pakaian dan fotonya akan ikut terhapus. Tindakan ini tidak bisa dibatalkan.`
  );
  if (!firstConfirm) return;

  const typed = prompt(`Ketik nomor nota "${trxId}" untuk konfirmasi hapus permanen:`);
  if (typed === null) return;

  if (typed.trim() !== trxId) {
    showToast("Nomor nota tidak cocok. Penghapusan permanen dibatalkan.", "warning");
    return;
  }

  try {
    await hardDeleteTransaksi(trxId);
    showToast(`Transaksi ${trxId} dihapus permanen.`, "success");
    await loadSampahData();
  } catch (err) {
    console.error("Gagal menghapus permanen:", err);
    showToast("Gagal menghapus permanen: " + err.message, "error");
  }
}
