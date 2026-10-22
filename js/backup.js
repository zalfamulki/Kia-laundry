/**
 * KIA LAUNDRY — Modul Backup & Restore Database IndexedDB
 * Task 2: Backup otomatis ke folder perangkat + purge otomatis foto lama
 * - exportDatabaseJson: unduh JSON manual
 * - autoBackupToFolder: File System Access API (Chrome/Edge desktop)
 * - restoreDatabaseJson: restore dengan opsi gabung / ganti
 * - getStorageEstimate: quota browser
 */

class BackupManager {
  // =====================================================
  // Unduh seluruh database sebagai file JSON (manual)
  // =====================================================
  static async exportDatabaseJson() {
    const backupData = {
      app: "KIA Laundry",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        transaksi: await db.transaksi.toArray(),
        pakaian: await db.pakaian.toArray(),
        customer: await db.customer.toArray(),
        pengaturan: await db.pengaturan.toArray()
      }
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const today = new Date().toISOString().slice(0, 10);

    ExportManager.triggerDownload(blob, `Backup_KIALaundry_${today}.json`);
    BackupManager._recordLastBackupTime();
  }

  // =====================================================
  // Task 2.3: Backup otomatis ke folder perangkat
  // Menggunakan File System Access API (Chrome/Edge desktop)
  // Simpan handle folder di IndexedDB (opaque object) agar bisa dipakai ulang.
  // =====================================================
  static _FOLDER_HANDLE_KEY = "kia_backup_folder_handle";
  static _LAST_BACKUP_KEY   = "kia_auto_backup_last";
  static _BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 hari

  /** Apakah File System Access API tersedia? */
  static isFsaSupported() {
    return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
  }

  /** Simpan waktu backup terakhir ke localStorage */
  static _recordLastBackupTime() {
    localStorage.setItem(BackupManager._LAST_BACKUP_KEY, new Date().toISOString());
  }

  /** Berapa hari sejak backup terakhir */
  static getLastBackupDaysAgo() {
    const raw = localStorage.getItem(BackupManager._LAST_BACKUP_KEY);
    if (!raw) return null;
    const diff = Date.now() - new Date(raw).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Minta pengguna memilih folder tujuan backup.
   * Menyimpan DirectoryHandle ke db.pengaturan agar bisa dipakai ulang.
   * @returns {FileSystemDirectoryHandle|null}
   */
  static async pickBackupFolder() {
    if (!BackupManager.isFsaSupported()) return null;
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite", startIn: "documents" });
      // Simpan handle ke IndexedDB (di tabel pengaturan)
      await db.pengaturan.put({ id: "backupFolderHandle", handle });
      return handle;
    } catch (err) {
      if (err.name === "AbortError") return null; // Pengguna batal
      console.warn("Gagal memilih folder backup:", err);
      return null;
    }
  }

  /**
   * Ambil handle folder backup yang tersimpan.
   * Meminta ulang izin jika diperlukan.
   * @returns {FileSystemDirectoryHandle|null}
   */
  static async getSavedFolderHandle() {
    try {
      const record = await db.pengaturan.get("backupFolderHandle");
      if (!record || !record.handle) return null;

      const handle = record.handle;
      // Minta ulang izin read/write
      const perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") return null;

      return handle;
    } catch (err) {
      console.warn("Handle folder backup tidak valid lagi:", err);
      return null;
    }
  }

  /**
   * Tulis file backup JSON ke folder perangkat.
   * @param {FileSystemDirectoryHandle} folderHandle
   * @returns {string} Nama file yang ditulis
   */
  static async writeBackupToFolder(folderHandle) {
    const backupData = {
      app: "KIA Laundry",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        transaksi: await db.transaksi.toArray(),
        pakaian: await db.pakaian.toArray(),
        customer: await db.customer.toArray(),
        pengaturan: await db.pengaturan.toArray()
      }
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const today = new Date().toISOString().slice(0, 10);
    const filename = `Backup_KIALaundry_${today}.json`;

    const fileHandle = await folderHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(jsonString);
    await writable.close();

    BackupManager._recordLastBackupTime();
    return filename;
  }

  /**
   * Jalankan backup otomatis: maksimal sekali per hari.
   * Tidak memblokir aplikasi jika gagal.
   * @returns {{ ran: boolean, filename?: string, error?: string }}
   */
  static async runAutoBackup() {
    if (!BackupManager.isFsaSupported()) {
      return { ran: false, error: "FSA tidak didukung browser ini" };
    }

    // Cek apakah sudah backup hari ini
    const last = localStorage.getItem(BackupManager._LAST_BACKUP_KEY);
    if (last) {
      const today = new Date().toISOString().slice(0, 10);
      if (last.slice(0, 10) === today) {
        return { ran: false, reason: "Sudah backup hari ini" };
      }
    }

    try {
      const handle = await BackupManager.getSavedFolderHandle();
      if (!handle) return { ran: false, reason: "Folder backup belum dipilih" };

      const filename = await BackupManager.writeBackupToFolder(handle);
      return { ran: true, filename };
    } catch (err) {
      console.warn("Auto-backup gagal:", err);
      return { ran: false, error: err.message };
    }
  }

  // =====================================================
  // Restore database dari file JSON
  // =====================================================
  static async restoreDatabaseJson(jsonString, mode = "replace") {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      throw new Error("File backup tidak valid atau format JSON rusak.");
    }

    if (!parsed.data || !parsed.data.transaksi || !parsed.data.pakaian) {
      throw new Error("Struktur file backup tidak sesuai format KIA Laundry.");
    }

    if (mode === "replace") {
      // Hapus seluruh tabel lama
      await db.transaksi.clear();
      await db.pakaian.clear();
      await db.customer.clear();
      await db.pengaturan.clear();
    }

    // Masukkan data baru
    if (parsed.data.transaksi?.length) {
      await db.transaksi.bulkPut(parsed.data.transaksi);
    }
    if (parsed.data.pakaian?.length) {
      await db.pakaian.bulkPut(parsed.data.pakaian);
    }
    if (parsed.data.customer?.length) {
      await db.customer.bulkPut(parsed.data.customer);
    }
    if (parsed.data.pengaturan?.length) {
      // Jangan restore handle folder (akan menjadi stale di perangkat lain)
      const filteredPengaturan = parsed.data.pengaturan.filter(
        (p) => p.id !== "backupFolderHandle"
      );
      if (filteredPengaturan.length) {
        await db.pengaturan.bulkPut(filteredPengaturan);
      }
    }

    return {
      transaksiCount: parsed.data.transaksi?.length || 0,
      pakaianCount: parsed.data.pakaian?.length || 0,
      customerCount: parsed.data.customer?.length || 0
    };
  }

  // =====================================================
  // Estimasi pemakaian IndexedDB / Storage Browser
  // =====================================================
  static async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      const usageMb = (usage / (1024 * 1024)).toFixed(1);
      const quotaMb = (quota / (1024 * 1024)).toFixed(0);
      const percent = Math.min(100, Math.round((usage / quota) * 100));
      return { usageMb, quotaMb, percent };
    }
    return { usageMb: "N/A", quotaMb: "N/A", percent: 0 };
  }
}
