/**
 * KIA LAUNDRY — Backup & Restore Page Logic
 * Menangani pengunduhan database JSON utuh beserta foto pakaian,
 * pemulihan database dengan opsi gabung atau timpa, dan estimasi storage kuota browser.
 */

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("backup");
  renderFooter();

  try {
    await initDB();
    await updateStorageInfo();
    setupBackupHandlers();
  } catch (err) {
    console.error("Gagal inisialisasi backup page:", err);
    showToast("Gagal memuat status penyimpanan.", "error");
  }
});

async function updateStorageInfo() {
  const trkCount = await db.transaksi.count();
  const pknCount = await db.pakaian.count();
  const cusCount = await db.customer.count();

  document.getElementById("backupTrxCount").textContent = `${trkCount} Transaksi`;
  document.getElementById("backupPknCount").textContent = `${pknCount} Foto Pakaian`;
  document.getElementById("backupCusCount").textContent = `${cusCount} Pelanggan`;

  // Storage Quota
  const estimate = await BackupManager.getStorageEstimate();
  const elUsage = document.getElementById("storageUsageText");
  const elFill = document.getElementById("storageProgressFill");

  if (elUsage) {
    elUsage.textContent = `${estimate.usageMb} MB terpakai dari estimasi kuota browser ${estimate.quotaMb} MB`;
  }
  if (elFill) {
    elFill.style.width = `${estimate.percent || 1}%`;
  }
}

function setupBackupHandlers() {
  // Tombol Unduh Backup JSON
  const btnDownload = document.getElementById("btnDownloadBackup");
  if (btnDownload) {
    btnDownload.addEventListener("click", async () => {
      try {
        btnDownload.disabled = true;
        showToast("Memproses data dan foto untuk diekspor...", "info");
        await BackupManager.exportDatabaseJson();
        showToast("File backup JSON berhasil diunduh!", "success");
      } catch (err) {
        showToast("Gagal mengunduh backup: " + err.message, "error");
      } finally {
        btnDownload.disabled = false;
      }
    });
  }

  // Form Restore File JSON
  const restoreFileInput = document.getElementById("restoreFileInput");
  const btnTriggerRestore = document.getElementById("btnTriggerRestore");

  if (btnTriggerRestore && restoreFileInput) {
    btnTriggerRestore.addEventListener("click", () => {
      restoreFileInput.click();
    });

    restoreFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const restoreMode = document.querySelector('input[name="restoreMode"]:checked')?.value || "merge";
      const isReplace = restoreMode === "replace";

      const confirmMsg = isReplace
        ? "PERINGATAN: Opsi 'Ganti Seluruh Data' akan MENGHAPUS SEMUA data yang ada di browser saat ini dan menggantinya dengan isi file backup. Lanjutkan?"
        : "Data dari file backup akan digabungkan dengan data yang sudah ada di browser. Lanjutkan?";

      if (!confirm(confirmMsg)) {
        restoreFileInput.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          showToast("Memulihkan database...", "info");
          const result = await BackupManager.restoreDatabaseJson(event.target.result, restoreMode);
          showToast(`Berhasil memulihkan ${result.transaksiCount} transaksi dan ${result.pakaianCount} foto pakaian!`, "success");
          await updateStorageInfo();
          setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
          console.error("Gagal restore:", err);
          showToast("Gagal memulihkan file: " + err.message, "error");
        } finally {
          restoreFileInput.value = "";
        }
      };
      reader.readAsText(file);
    });
  }
}
