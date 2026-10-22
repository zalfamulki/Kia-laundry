/**
 * KIA LAUNDRY — IndexedDB Layer via Dexie.js
 * Menyimpan data transaksi, pakaian (dengan foto), customer, & pengaturan.
 */

const db = new Dexie("KiaLaundryDB");

db.version(1).stores({
  transaksi: "id, tanggalMasuk, namaCustomer, noHp, layanan, estimasiSelesai, status, statusBayar, totalHarga, createdAt",
  pakaian: "id, transaksiId, jenis, warna, kondisi, createdAt",
  customer: "id, nama, noHp, totalTransaksi, createdAt",
  pengaturan: "id"
});

// Inisialisasi default settings dan sample data bila database baru
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

  // Cek jika transaksi kosong, isi 3 sample data realistis
  const trxCount = await db.transaksi.count();
  if (trxCount === 0) {
    const today = new Date().toISOString().split("T")[0];
    const dummyTrx = [
      {
        id: `TRX-${today.replace(/-/g, "")}-001`,
        tanggalMasuk: `${today}T08:30:00`,
        namaCustomer: "Budi Santoso",
        noHp: "081234567890",
        alamat: "Komplek Pesona Ciganitri A4",
        layanan: "cuci-setrika",
        berat: 4.5,
        estimasiSelesai: `${today}T17:00:00`,
        status: "siap",
        statusBayar: "lunas",
        totalHarga: 40500,
        catatan: "Pewangi lavender, pakaian kerja hati-hati",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `TRX-${today.replace(/-/g, "")}-002`,
        tanggalMasuk: `${today}T09:15:00`,
        namaCustomer: "Siti Rahmawati",
        noHp: "085711223344",
        alamat: "Jl. Sukabirus No. 15",
        layanan: "cuci-setrika",
        berat: 3.2,
        estimasiSelesai: `${today}T18:00:00`,
        status: "dicuci",
        statusBayar: "belum",
        totalHarga: 28800,
        catatan: "Ada kemeja putih jangan luntur",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `TRX-${today.replace(/-/g, "")}-003`,
        tanggalMasuk: `${today}T10:45:00`,
        namaCustomer: "Andi Wijaya",
        noHp: "081987654321",
        alamat: "Podomoro Park Cluster Amagriya",
        layanan: "satuan",
        berat: 0,
        estimasiSelesai: `${today}T16:00:00`,
        status: "masuk",
        statusBayar: "dp",
        totalHarga: 40000,
        catatan: "Jas resmi & sepatu kantor",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    for (const trx of dummyTrx) {
      await db.transaksi.put(trx);
      // Tambah customer
      const existingCus = await db.customer.where("noHp").equals(trx.noHp).first();
      if (!existingCus) {
        await db.customer.put({
          id: "CUS-" + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
          nama: trx.namaCustomer,
          noHp: trx.noHp,
          alamat: trx.alamat,
          catatan: "",
          totalTransaksi: 1,
          totalBelanja: trx.totalHarga,
          createdAt: trx.createdAt
        });
      }
    }

    // SVG placeholder foto untuk sample pakaian
    const sampleSvgImg = (text, bg, fg) => 
      `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="${bg}" width="400" height="400"/><text fill="${fg}" font-family="sans-serif" font-size="28" font-weight="bold" x="50%" y="45%" text-anchor="middle">${text}</text><text fill="${fg}" opacity="0.8" font-family="sans-serif" font-size="18" x="50%" y="60%" text-anchor="middle">KIA Laundry</text></svg>`;

    const samplePakaian = [
      {
        id: "PCN-" + Date.now() + "-1",
        transaksiId: dummyTrx[0].id,
        jenis: "Kemeja Lengan Panjang",
        warna: "Biru Muda",
        merek: "Executive",
        kondisi: "Noda halus di kerah baju",
        jumlah: 2,
        foto: sampleSvgImg("Kemeja Biru Muda", "%23e0f2fe", "%230369a1"),
        fotoThumb: sampleSvgImg("Kemeja Biru", "%23e0f2fe", "%230369a1"),
        createdAt: dummyTrx[0].createdAt
      },
      {
        id: "PCN-" + Date.now() + "-2",
        transaksiId: dummyTrx[0].id,
        jenis: "Celana Chino",
        warna: "Khaki Cokelat",
        merek: "Uniqlo",
        kondisi: "Kondisi baik & utuh",
        jumlah: 2,
        foto: sampleSvgImg("Celana Chino", "%23fef3c7", "%2392400e"),
        fotoThumb: sampleSvgImg("Celana Chino", "%23fef3c7", "%2392400e"),
        createdAt: dummyTrx[0].createdAt
      },
      {
        id: "PCN-" + Date.now() + "-3",
        transaksiId: dummyTrx[1].id,
        jenis: "Dress Katun",
        warna: "Bunga Pink",
        merek: "Zara",
        kondisi: "Kancing atas sedikit longgar",
        jumlah: 1,
        foto: sampleSvgImg("Dress Pink", "%23fce7f3", "%239d174d"),
        fotoThumb: sampleSvgImg("Dress Pink", "%23fce7f3", "%239d174d"),
        createdAt: dummyTrx[1].createdAt
      },
      {
        id: "PCN-" + Date.now() + "-4",
        transaksiId: dummyTrx[2].id,
        jenis: "Jas Kerja Formal",
        warna: "Hitam",
        merek: "Jobb",
        kondisi: "Perlu dry clean & hanger khusus",
        jumlah: 1,
        foto: sampleSvgImg("Jas Formal Hitam", "%231e293b", "%23f8fafc"),
        fotoThumb: sampleSvgImg("Jas Hitam", "%231e293b", "%23f8fafc"),
        createdAt: dummyTrx[2].createdAt
      }
    ];

    for (const p of samplePakaian) {
      await db.pakaian.put(p);
    }
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
