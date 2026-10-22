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

// Inisialisasi default settings toko (tanpa data dummy transaksi/pakaian)
async function initDB() {
  // Pembersihan otomatis data dummy versi lama jika ada
  if (localStorage.getItem("kia_cleared_dummy_v2") !== "true") {
    await db.transaksi.clear();
    await db.pakaian.clear();
    await db.customer.clear();
    localStorage.setItem("kia_cleared_dummy_v2", "true");
  }

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
}

// Generate nomor transaksi berurutan: TRX-YYYYMMDD-XXX
async function generateNextTrxId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `TRX-${dateStr}-`;
  
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
