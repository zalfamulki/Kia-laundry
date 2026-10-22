/**
 * KIA LAUNDRY — Modul Backup & Restore Database IndexedDB
 * Menyimpan seluruh koleksi transaksi, foto pakaian, customer, & konfigurasi
 * ke dalam file JSON terenkapsulasi, dan mengembalikannya dengan opsi gabung/timpa.
 */

class BackupManager {
  // Unduh seluruh database sebagai file JSON
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
  }

  // Restore database dari file JSON
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
      await db.pengaturan.bulkPut(parsed.data.pengaturan);
    }

    return {
      transaksiCount: parsed.data.transaksi?.length || 0,
      pakaianCount: parsed.data.pakaian?.length || 0,
      customerCount: parsed.data.customer?.length || 0
    };
  }

  // Estimasi pemakaian IndexedDB / Storage Browser
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
