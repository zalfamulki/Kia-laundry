/**
 * KIA LAUNDRY — Backup & Restore Page Logic (Task 2 update)
 * Task 2.2: Cek purge otomatis saat halaman dibuka + preview & konfirmasi.
 * Task 2.3: Auto-backup ke folder perangkat (FSA API).
 * Task 2.4: Meter kuota storage lengkap (MB, foto aktif, foto purged).
 */

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("backup");
  renderFooter();

  try {
    await initDB();
    await updateStorageInfo();
    setupBackupHandlers();
    await checkAutoBackupOnLoad();
    await checkPurgeOnLoad();
  } catch (err) {
    console.error("Gagal inisialisasi backup page:", err);
    showToast("Gagal memuat status penyimpanan.", "error");
  }
});

// =====================================================
// Task 2.4 — Meter kuota storage lengkap
// =====================================================
async function updateStorageInfo() {
  const trkCount = await db.transaksi.count();
  const pknCount = await db.pakaian.count();
  const cusCount = await db.customer.count();

  document.getElementById("backupTrxCount").textContent = `${trkCount} Transaksi`;
  document.getElementById("backupPknCount").textContent = `${pknCount} Pakaian`;
  document.getElementById("backupCusCount").textContent = `${cusCount} Pelanggan`;

  // Storage Quota
  const estimate = await BackupManager.getStorageEstimate();
  const elUsage = document.getElementById("storageUsageText");
  const elFill = document.getElementById("storageProgressFill");

  if (elUsage) {
    elUsage.textContent = `${estimate.usageMb} MB terpakai dari estimasi kuota browser ${estimate.quotaMb} MB`;
  }
  if (elFill) {
    const pct = estimate.percent || 1;
    elFill.style.width = `${pct}%`;
    // Warna warning saat > 80%
    elFill.style.background = pct >= 80 ? "#ef4444" : pct >= 60 ? "#f59e0b" : "";
  }

  // Status persistent storage
  const persistStatus = await getPersistentStorageStatus();
  const elPersist = document.getElementById("storagePersistStatus");
  if (elPersist) {
    elPersist.classList.remove("is-granted", "is-denied", "is-unsupported");
    if (persistStatus === "granted") {
      elPersist.textContent = "Storage permanen: aktif";
      elPersist.classList.add("is-granted");
    } else if (persistStatus === "denied") {
      elPersist.textContent = "Storage permanen: belum aktif";
      elPersist.classList.add("is-denied");
    } else {
      elPersist.textContent = "Storage permanen: tidak didukung browser";
      elPersist.classList.add("is-unsupported");
    }
  }

  // Task 2.4 — Statistik foto aktif vs purged
  const photoStats = await getPhotoStats();
  const elFotoAktif = document.getElementById("fotoAktifCount");
  const elFotoPurged = document.getElementById("fotoPurgedCount");
  const elFotoMb = document.getElementById("fotoUsageMb");

  if (elFotoAktif) elFotoAktif.textContent = photoStats.aktif;
  if (elFotoPurged) elFotoPurged.textContent = photoStats.purged;
  if (elFotoMb) {
    const mb = (photoStats.totalBytes / (1024 * 1024)).toFixed(1);
    elFotoMb.textContent = `~${mb} MB`;
  }

  // Backup terakhir
  const daysAgo = BackupManager.getLastBackupDaysAgo();
  const elLastBackup = document.getElementById("lastBackupInfo");
  if (elLastBackup) {
    if (daysAgo === null) {
      elLastBackup.textContent = "Belum pernah backup";
      elLastBackup.style.color = "var(--status-danger)";
    } else if (daysAgo === 0) {
      elLastBackup.textContent = "Backup terakhir: hari ini ✓";
      elLastBackup.style.color = "#16a34a";
    } else {
      elLastBackup.textContent = `Backup terakhir: ${daysAgo} hari lalu${daysAgo > 7 ? " ⚠️ Sudah lama!" : ""}`;
      elLastBackup.style.color = daysAgo > 7 ? "var(--status-danger)" : "var(--text-muted)";
    }
  }

  // Status folder backup FSA
  const elFsaStatus = document.getElementById("fsaFolderStatus");
  if (elFsaStatus) {
    if (!BackupManager.isFsaSupported()) {
      elFsaStatus.textContent = "Fitur backup folder tidak didukung browser ini (gunakan Chrome/Edge)";
      elFsaStatus.style.color = "var(--text-muted)";
    } else {
      const record = await db.pengaturan.get("backupFolderHandle");
      if (record && record.handle) {
        elFsaStatus.textContent = `Folder terpilih: "${record.handle.name}" (backup otomatis aktif)`;
        elFsaStatus.style.color = "#16a34a";
      } else {
        elFsaStatus.textContent = "Folder backup belum dipilih";
        elFsaStatus.style.color = "var(--text-muted)";
      }
    }
  }
}

// =====================================================
// Task 2.3 — Auto-backup ke folder perangkat saat load
// =====================================================
async function checkAutoBackupOnLoad() {
  const result = await BackupManager.runAutoBackup();
  if (result.ran && result.filename) {
    showToast(`Backup otomatis berhasil: ${result.filename}`, "success");
    await updateStorageInfo();
  }
  // Tidak tampilkan error/warning untuk auto-backup — tidak boleh mengganggu
}

// =====================================================
// Task 2.2 — Cek purge otomatis saat halaman backup dibuka
// =====================================================
async function checkPurgeOnLoad() {
  // Ambil batas hari dari settings
  const settings = (await db.pengaturan.get("app")) || {};
  const batasHari = Number(settings.batasPurgeHari) || 90;

  // Cek apakah purge sudah dijalankan hari ini
  const lastPurge = localStorage.getItem("kia_last_purge_check");
  const today = new Date().toISOString().slice(0, 10);
  if (lastPurge === today) return; // Sudah dicek hari ini

  const preview = await previewPurgeOld(batasHari);
  localStorage.setItem("kia_last_purge_check", today);

  if (preview.fotoCount === 0) return;

  // Tampilkan notifikasi non-blocking
  showToast(
    `Ada ${preview.fotoCount} foto lama (>${batasHari} hari) yang siap dibersihkan — klik "Purge Otomatis" untuk membebaskan ~${preview.estimasiMb} MB`,
    "warning"
  );

  // Update badge di tombol purge
  const elPurgeBadge = document.getElementById("purgePreviewBadge");
  if (elPurgeBadge) {
    elPurgeBadge.textContent = `${preview.fotoCount} foto, ~${preview.estimasiMb} MB`;
    elPurgeBadge.hidden = false;
  }
}

// =====================================================
// Setup event handlers
// =====================================================
function setupBackupHandlers() {
  // --- Tombol Unduh Backup JSON (manual) ---
  const btnDownload = document.getElementById("btnDownloadBackup");
  if (btnDownload) {
    btnDownload.addEventListener("click", async () => {
      try {
        btnDownload.disabled = true;
        showToast("Memproses data dan foto untuk diekspor...", "info");
        await BackupManager.exportDatabaseJson();
        showToast("File backup JSON berhasil diunduh!", "success");
        await updateStorageInfo();
      } catch (err) {
        showToast("Gagal mengunduh backup: " + err.message, "error");
      } finally {
        btnDownload.disabled = false;
      }
    });
  }

  // --- Task 2.3: Pilih Folder Backup ---
  const btnPickFolder = document.getElementById("btnPickBackupFolder");
  if (btnPickFolder) {
    if (!BackupManager.isFsaSupported()) {
      btnPickFolder.disabled = true;
      btnPickFolder.title = "Tidak didukung browser ini";
    } else {
      btnPickFolder.addEventListener("click", async () => {
        try {
          const handle = await BackupManager.pickBackupFolder();
          if (handle) {
            showToast(`Folder "${handle.name}" berhasil dipilih. Backup otomatis aktif.`, "success");
            await updateStorageInfo();
          }
        } catch (err) {
          showToast("Gagal memilih folder: " + err.message, "error");
        }
      });
    }
  }

  // --- Task 2.3: Backup Sekarang ke Folder ---
  const btnBackupNow = document.getElementById("btnBackupToFolderNow");
  if (btnBackupNow) {
    if (!BackupManager.isFsaSupported()) {
      btnBackupNow.disabled = true;
    } else {
      btnBackupNow.addEventListener("click", async () => {
        try {
          btnBackupNow.disabled = true;
          showToast("Menyimpan backup ke folder perangkat...", "info");

          let handle = await BackupManager.getSavedFolderHandle();
          if (!handle) {
            // Minta pilih folder dulu
            handle = await BackupManager.pickBackupFolder();
          }
          if (!handle) {
            showToast("Folder backup belum dipilih.", "warning");
            return;
          }

          const filename = await BackupManager.writeBackupToFolder(handle);
          showToast(`Backup disimpan ke folder: ${filename}`, "success");
          await updateStorageInfo();
        } catch (err) {
          showToast("Gagal backup ke folder: " + err.message, "error");
        } finally {
          btnBackupNow.disabled = false;
        }
      });
    }
  }

  // --- Task 2.2: Purge Foto Otomatis ---
  const btnPurge = document.getElementById("btnPurgeOld");
  if (btnPurge) {
    btnPurge.addEventListener("click", async () => {
      const settings = (await db.pengaturan.get("app")) || {};
      const batasHari = Number(settings.batasPurgeHari) || 90;

      const preview = await previewPurgeOld(batasHari);

      if (preview.fotoCount === 0) {
        showToast(`Tidak ada foto yang perlu dibersihkan (batas ${batasHari} hari).`, "info");
        return;
      }

      const konfirmasi = confirm(
        `Akan menghapus ${preview.fotoCount} foto dari ${preview.trxIds.length} transaksi yang sudah diambil lebih dari ${batasHari} hari lalu.\n\nEstimasi storage yang dibebaskan: ~${preview.estimasiMb} MB\n\nData teks transaksi dan pakaian TETAP ada.\n\nLanjutkan?`
      );

      if (!konfirmasi) return;

      try {
        btnPurge.disabled = true;
        showToast("Menjalankan pembersihan foto otomatis...", "info");
        const result = await purgeOldPhotos(batasHari);
        showToast(
          `Berhasil! ${result.fotoCount} foto dihapus, ~${result.estimasiMb} MB dibebaskan.`,
          "success"
        );
        await updateStorageInfo();
        localStorage.setItem("kia_last_purge_check", new Date().toISOString().slice(0, 10));
        const elBadge = document.getElementById("purgePreviewBadge");
        if (elBadge) elBadge.hidden = true;
      } catch (err) {
        showToast("Gagal menjalankan purge: " + err.message, "error");
      } finally {
        btnPurge.disabled = false;
      }
    });
  }

  // --- Form Restore File JSON ---
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
          showToast(
            `Berhasil memulihkan ${result.transaksiCount} transaksi dan ${result.pakaianCount} pakaian!`,
            "success"
          );
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
