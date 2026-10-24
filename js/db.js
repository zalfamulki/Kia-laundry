/**
 * KIA LAUNDRY — IndexedDB Layer via Dexie.js
 * Menyimpan data transaksi, pakaian (dengan foto), customer, & pengaturan.
 * Bersih tanpa data dummy untuk pengujian akurat.
 */

const db = new Dexie("KiaLaundryDB");

db.version(1).stores({
  transaksi: "id, tanggalMasuk, namaCustomer, noHp, layanan, estimasiSelesai, status, statusBayar, totalHarga, createdAt",
  pakaian: "id, transaksiId, jenis, warna, kondisi, createdAt",
  customer: "id, nama, noHp, totalTransaksi, createdAt",
  pengaturan: "id"
});

// Task 3 — soft delete transaksi.
// Record lama tanpa deletedAt otomatis dianggap aktif.
db.version(2).stores({
  transaksi: "id, tanggalMasuk, namaCustomer, noHp, layanan, estimasiSelesai, status, statusBayar, totalHarga, createdAt, deletedAt",
  pakaian: "id, transaksiId, jenis, warna, kondisi, createdAt",
  customer: "id, nama, noHp, totalTransaksi, createdAt",
  pengaturan: "id"
});

// Inisialisasi default settings toko (tanpa data dummy transaksi/pakaian)
async function initDB() {
  const settingsCount = await db.pengaturan.count();
  if (settingsCount === 0) {
    await db.pengaturan.put({
      id: "app",
      namaLaundry: "KIA Laundry",
      slogan: "Clean & Fresh — Semua Bisa, Layanan Antar Jemput",
      alamat: "Jl. Terusan Buah Batu No. 128, Bandung",
      noHp1: "085179591769",
      noHp2: "08112291769",
      logo: "./assets/logo.png",
      harga: {
        cuci: 6000,
        setrika: 5000,
        cuciSetrika: 9000,
        satuan: {
          kemeja: 7000,
          kaos: 5000,
          celana: 7000,
          jeans: 9000,
          jaket: 12000,
          selimut: 15000,
          bedcover: 25000,
          jas: 20000,
          sepatu: 25000
        }
      },
      modePreference: "auto" // 'auto', 'offline', 'online'
    });
  }

  // Minta browser mempertahankan data agar tidak mudah dievict saat storage menipis.
  // Tidak menghalangi aplikasi jika browser menolak atau tidak mendukung.
  await requestPersistentStorage();

  // Task 3.4 — bersihkan Sampah yang sudah lewat 30 hari (maksimal sekali/hari).
  // Aman jika gagal: tidak boleh memblokir aplikasi.
  await runTrashPurgeOncePerDay();
}

// Minta status persistent storage (tahan eviction browser)
async function requestPersistentStorage() {
  if (!navigator.storage || typeof navigator.storage.persist !== "function") {
    return "unsupported";
  }

  try {
    if (typeof navigator.storage.persisted === "function") {
      const alreadyPersisted = await navigator.storage.persisted();
      if (alreadyPersisted) return "granted";
    }

    const granted = await navigator.storage.persist();
    return granted ? "granted" : "denied";
  } catch (err) {
    console.warn("Permintaan persistent storage gagal:", err);
    return "denied";
  }
}

// Baca status persistent storage tanpa meminta ulang
async function getPersistentStorageStatus() {
  if (!navigator.storage || typeof navigator.storage.persisted !== "function") {
    return "unsupported";
  }

  try {
    return (await navigator.storage.persisted()) ? "granted" : "denied";
  } catch (err) {
    console.warn("Gagal membaca status persistent storage:", err);
    return "unsupported";
  }
}

// Generate nomor transaksi berurutan: KIA-YYMM-XXX
// Contoh: KIA-2610-001 (Oktober 2026, transaksi pertama bulan itu)
async function generateNextTrxId() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `KIA-${year}${month}-`;

  const matches = await db.transaksi
    .where("id")
    .startsWith(prefix)
    .toArray();

  let maxSeq = 0;
  for (const item of matches) {
    const parts = item.id.split("-");
    const seq = parseInt(parts[2], 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const nextSeq = String(maxSeq + 1).padStart(3, "0");
  return `${prefix}${nextSeq}`;
}

// ============================================================
// Task 2 — Purge foto & statistik storage
// ============================================================

/**
 * Hapus foto dari pakaian milik nota/transaksi tertentu.
 * Data teks (jenis, warna, dll.) dan record transaksi TETAP ada.
 * Simpan marker exportedAt pada transaksi sebagai tanda arsip.
 * @param {string[]} trxIds - Daftar ID transaksi yang difoto-hapus
 * @returns {{ fotoCount: number, estimasiMb: number }}
 */
async function purgeFotoNota(trxIds) {
  if (!trxIds || trxIds.length === 0) return { fotoCount: 0, estimasiMb: 0 };

  const pakaianList = await db.pakaian
    .where("transaksiId")
    .anyOf(trxIds)
    .toArray();

  let fotoCount = 0;
  let totalBytes = 0;

  for (const p of pakaianList) {
    let changed = false;
    const update = {};

    if (p.foto) {
      // Estimasi ukuran base64: panjang string * 0.75
      totalBytes += Math.round(p.foto.length * 0.75);
      update.foto = null;
      fotoCount++;
      changed = true;
    }
    if (p.fotoThumb) {
      totalBytes += Math.round(p.fotoThumb.length * 0.75);
      update.fotoThumb = null;
      changed = true;
    }

    if (changed) {
      update.fotoPurgedAt = new Date().toISOString();
      await db.pakaian.update(p.id, update);
    }
  }

  // Tandai transaksi sebagai telah diarsipkan
  const now = new Date().toISOString();
  for (const id of trxIds) {
    await db.transaksi.update(id, { exportedAt: now });
  }

  const estimasiMb = (totalBytes / (1024 * 1024)).toFixed(2);
  return { fotoCount, estimasiMb };
}

/**
 * Preview: hitung berapa foto yang akan dihapus oleh purge otomatis.
 * Kriteria: transaksi berstatus 'diambil' dan tanggal updatedAt / estimasiSelesai
 * sudah lebih dari `batasHari` hari lalu, serta foto belum di-purge.
 * @param {number} batasHari
 * @returns {{ trxIds: string[], fotoCount: number, estimasiMb: number }}
 */
async function previewPurgeOld(batasHari = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - batasHari);
  const cutoffStr = cutoff.toISOString();

  const selesaiList = await db.transaksi
    .where("status")
    .equals("diambil")
    .toArray();

  const kandidat = selesaiList.filter((t) => {
    if (t.deletedAt) return false;
    const ref = t.updatedAt || t.estimasiSelesai || t.tanggalMasuk || "";
    return ref < cutoffStr;
  });

  const trxIds = kandidat.map((t) => t.id);
  if (trxIds.length === 0) return { trxIds: [], fotoCount: 0, estimasiMb: 0 };

  const pakaianList = await db.pakaian
    .where("transaksiId")
    .anyOf(trxIds)
    .toArray();

  let fotoCount = 0;
  let totalBytes = 0;

  for (const p of pakaianList) {
    if (p.foto && !p.fotoPurgedAt) {
      totalBytes += Math.round(p.foto.length * 0.75);
      fotoCount++;
    }
    if (p.fotoThumb && !p.fotoPurgedAt) {
      totalBytes += Math.round(p.fotoThumb.length * 0.75);
    }
  }

  const estimasiMb = (totalBytes / (1024 * 1024)).toFixed(2);
  return { trxIds, fotoCount, estimasiMb };
}

/**
 * Jalankan purge otomatis berdasarkan umur.
 * Hanya menghapus foto transaksi yang sudah 'diambil' dan melewati batas umur.
 * @param {number} batasHari
 * @returns {{ fotoCount: number, estimasiMb: number }}
 */
async function purgeOldPhotos(batasHari = 90) {
  const { trxIds } = await previewPurgeOld(batasHari);
  if (trxIds.length === 0) return { fotoCount: 0, estimasiMb: 0 };
  return purgeFotoNota(trxIds);
}

/**
 * Statistik foto: berapa item masih punya foto, berapa sudah di-purge.
 * @returns {{ aktif: number, purged: number, totalBytes: number }}
 */
async function getPhotoStats() {
  const allPkn = await db.pakaian.toArray();
  let aktif = 0;
  let purged = 0;
  let totalBytes = 0;

  for (const p of allPkn) {
    if (p.foto) {
      aktif++;
      totalBytes += Math.round(p.foto.length * 0.75);
    }
    if (p.fotoThumb) {
      totalBytes += Math.round(p.fotoThumb.length * 0.75);
    }
    if (p.fotoPurgedAt && !p.foto) purged++;
  }

  return { aktif, purged, totalBytes };
}

// ============================================================

// Update / Tambah customer secara otomatis saat transaksi disimpan
async function upsertCustomer(nama, noHp, alamat = "", totalHarga = 0) {
  if (!noHp) return null;
  const existing = await db.customer.where("noHp").equals(noHp).first();
  if (existing) {
    await db.customer.update(existing.id, {
      nama: nama || existing.nama,
      alamat: alamat || existing.alamat,
      totalTransaksi: (existing.totalTransaksi || 0) + 1,
      totalBelanja: (existing.totalBelanja || 0) + (Number(totalHarga) || 0)
    });
    return existing.id;
  } else {
    const newId = "CUS-" + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    await db.customer.put({
      id: newId,
      nama: nama || "Customer Baru",
      noHp: noHp,
      alamat: alamat,
      catatan: "",
      totalTransaksi: 1,
      totalBelanja: Number(totalHarga) || 0,
      createdAt: new Date().toISOString()
    });
    return newId;
  }
}

// ============================================================
// Task 3 — CRUD transaksi, soft delete, & Sampah
// ============================================================

const TRASH_RETENTION_DAYS = 30;
const TRASH_PURGE_CHECK_KEY = "kia_last_trash_purge";

/** Semua transaksi aktif (belum dihapus). */
async function getActiveTransaksi() {
  const list = await db.transaksi.toArray();
  return list.filter((t) => !t.deletedAt);
}

/** Semua transaksi di Sampah, terbaru lebih dulu. */
async function getDeletedTransaksi() {
  const list = await db.transaksi.toArray();
  return list
    .filter((t) => Boolean(t.deletedAt))
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

/**
 * Hitung ulang statistik customer dari transaksi aktif.
 * - Customer tanpa transaksi aktif dihapus (tidak ada customer yatim).
 * - Jika customer sudah terhapus tetapi transaksi dipulihkan, customer dibuat ulang.
 * @param {string} noHp
 * @returns {Promise<string|null>} ID customer atau null
 */
async function recalcCustomerStats(noHp) {
  if (!noHp) return null;

  const trxList = (await db.transaksi.where("noHp").equals(noHp).toArray())
    .filter((t) => !t.deletedAt);
  const totalTransaksi = trxList.length;
  const totalBelanja = trxList.reduce(
    (sum, t) => sum + (Number(t.totalHarga) || 0),
    0
  );

  const customers = await db.customer.where("noHp").equals(noHp).toArray();

  if (totalTransaksi === 0) {
    if (customers.length > 0) {
      await db.customer.bulkDelete(customers.map((c) => c.id));
    }
    return null;
  }

  if (customers.length === 0) {
    const latest = trxList
      .slice()
      .sort((a, b) =>
        String(b.createdAt || b.tanggalMasuk || "").localeCompare(
          String(a.createdAt || a.tanggalMasuk || "")
        )
      )[0];

    const newId =
      "CUS-" + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    await db.customer.put({
      id: newId,
      nama: latest?.namaCustomer || "Customer Baru",
      noHp,
      alamat: latest?.alamat || "",
      catatan: "",
      totalTransaksi,
      totalBelanja,
      createdAt: new Date().toISOString()
    });
    return newId;
  }

  const primary = customers[0];
  await db.customer.update(primary.id, { totalTransaksi, totalBelanja });

  // Bersihkan duplikat lama dengan nomor HP yang sama.
  if (customers.length > 1) {
    await db.customer.bulkDelete(customers.slice(1).map((c) => c.id));
  }

  return primary.id;
}

/** Soft delete: sembunyikan transaksi tanpa menghapus data/foto. */
async function softDeleteTransaksi(trxId) {
  const trx = await db.transaksi.get(trxId);
  if (!trx) throw new Error("Transaksi tidak ditemukan.");
  if (trx.deletedAt) return trx;

  const now = new Date().toISOString();
  await db.transaksi.update(trxId, { deletedAt: now, updatedAt: now });
  await recalcCustomerStats(trx.noHp);

  return { ...trx, deletedAt: now, updatedAt: now };
}

/** Pulihkan transaksi dari Sampah. */
async function restoreTransaksi(trxId) {
  const trx = await db.transaksi.get(trxId);
  if (!trx) throw new Error("Transaksi tidak ditemukan.");
  if (!trx.deletedAt) return trx;

  const now = new Date().toISOString();
  await db.transaksi.update(trxId, { deletedAt: null, updatedAt: now });
  await recalcCustomerStats(trx.noHp);

  return { ...trx, deletedAt: null, updatedAt: now };
}

/** Hapus permanen satu transaksi beserta seluruh pakaiannya. */
async function hardDeleteTransaksi(trxId) {
  const trx = await db.transaksi.get(trxId);
  if (!trx) return false;

  await db.pakaian.where("transaksiId").equals(trxId).delete();
  await db.transaksi.delete(trxId);
  await recalcCustomerStats(trx.noHp);

  return true;
}

/** Hapus permanen transaksi Sampah yang lebih tua dari `hari`. */
async function purgeTrashOlderThan(hari = TRASH_RETENTION_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - hari);
  const cutoffStr = cutoff.toISOString();

  const expired = (await db.transaksi.toArray()).filter(
    (t) => t.deletedAt && t.deletedAt < cutoffStr
  );

  for (const trx of expired) {
    await db.pakaian.where("transaksiId").equals(trx.id).delete();
    await db.transaksi.delete(trx.id);
  }

  const affectedPhones = new Set(expired.map((t) => t.noHp).filter(Boolean));
  for (const noHp of affectedPhones) {
    await recalcCustomerStats(noHp);
  }

  return expired.length;
}

/** Jalankan purge Sampah maksimal sekali per hari, tanpa memblokir aplikasi. */
async function runTrashPurgeOncePerDay() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(TRASH_PURGE_CHECK_KEY) === today) return 0;

    const count = await purgeTrashOlderThan(TRASH_RETENTION_DAYS);
    localStorage.setItem(TRASH_PURGE_CHECK_KEY, today);
    return count;
  } catch (err) {
    console.warn("Purge Sampah otomatis gagal:", err);
    return 0;
  }
}
