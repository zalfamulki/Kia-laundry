/**
 * KIA LAUNDRY — Template WhatsApp (2 tahap)
 * Tahap 1: setelah transaksi masuk.
 * Tahap 2: saat cucian siap diantar/diambil.
 *
 * Template disimpan di `pengaturan.waTemplateMasuk` & `waTemplateSiap`.
 * Placeholder memakai format {nama_placeholder}. Template asli pengguna
 * tidak diubah; hanya placeholder yang diganti saat pesan dibuat.
 */

const WA_PLACEHOLDERS = [
  { key: "nama", label: "Nama pelanggan", contoh: "Ibu Sari" },
  { key: "toko", label: "Nama laundry", contoh: "KIA Laundry" },
  { key: "slogan", label: "Slogan laundry", contoh: "Clean & Fresh" },
  { key: "nota", label: "Nomor nota", contoh: "KIA-2610-001" },
  { key: "layanan", label: "Layanan", contoh: "Cuci + Setrika" },
  { key: "pcs", label: "Jumlah potong pakaian", contoh: "8 pcs" },
  { key: "berat_info", label: "Info berat (otomatis)", contoh: " (5.5 Kg)" },
  { key: "estimasi", label: "Estimasi selesai", contoh: "26 Okt 2026, 17.00" },
  { key: "total", label: "Total biaya", contoh: "Rp 90.000" },
  { key: "status_bayar", label: "Status pembayaran", contoh: "DP (dibayar Rp 40.000)" },
  { key: "sisa_info", label: "Info sisa tagihan (otomatis)", contoh: " • Sisa: Rp 50.000" },
  { key: "alamat", label: "Alamat pelanggan", contoh: "Jl. Buah Batu No. 12" },
  { key: "alamat_toko", label: "Alamat toko", contoh: "Jl. Terusan Buah Batu No. 128" },
  { key: "metode_info", label: "Info antar/ambil (otomatis)", contoh: "Silakan diambil di toko..." },
  { key: "catatan_info", label: "Catatan transaksi (otomatis)", contoh: "Catatan: Pewangi ekstra" },
  { key: "syarat", label: "Syarat & ketentuan", contoh: "Barang tidak diambil 30 hari..." },
  { key: "kasir", label: "Nama kasir", contoh: "Kasir KIA Laundry" }
];

function getWaTemplates(settings = {}) {
  return {
    masuk: settings.waTemplateMasuk || DEFAULT_WA_TEMPLATES.masuk,
    siap: settings.waTemplateSiap || DEFAULT_WA_TEMPLATES.siap
  };
}

/**
 * Ganti placeholder {key} dengan data. Placeholder yang tidak dikenal
 * dibiarkan apa adanya agar template pengguna tidak rusak.
 */
function renderWaTemplate(template, data = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return data[key] === null || data[key] === undefined ? "" : String(data[key]);
    }
    return match;
  });
}

function buildWaData(stage, trx, settings = {}, items = []) {
  const totalPcs = items.reduce((sum, p) => sum + (Number(p.jumlah) || 1), 0);
  const metode = trx?.metodePenyerahan === "ambil" ? "ambil" : "antar";
  const alamatToko = settings.alamat || "KIA Laundry";
  const alamatPelanggan = trx?.alamat || "(belum diisi)";
  const sisa =
    typeof getSisaTagihan === "function" ? getSisaTagihan(trx) : 0;
  const total = Number(trx?.totalHarga) || 0;

  const metodeInfo =
    metode === "antar"
      ? `Kami akan mengantar ke alamat: ${alamatPelanggan}. Mohon konfirmasi jika alamat sudah sesuai.`
      : `Silakan diambil di ${alamatToko} pada jam operasional (07.00–21.00 WIB).`;

  return {
    nama: trx?.namaCustomer || "Pelanggan",
    toko: settings.namaLaundry || "KIA Laundry",
    slogan: settings.slogan || "Clean & Fresh",
    nota: trx?.id || "-",
    layanan:
      typeof formatLayananLabel === "function"
        ? formatLayananLabel(trx?.layanan)
        : trx?.layanan || "-",
    pcs: totalPcs > 0 ? `${totalPcs} pcs` : "-",
    berat_info: trx?.berat ? ` (${trx.berat} Kg)` : "",
    estimasi:
      typeof formatTanggal === "function"
        ? formatTanggal(trx?.estimasiSelesai, true)
        : trx?.estimasiSelesai || "-",
    total:
      typeof formatRupiah === "function"
        ? formatRupiah(total)
        : `Rp ${total}`,
    status_bayar:
      typeof formatStatusBayarText === "function"
        ? formatStatusBayarText(trx?.statusBayar, trx)
        : trx?.statusBayar || "Belum Bayar",
    sisa_info:
      sisa > 0 && typeof formatRupiah === "function"
        ? ` • Sisa: ${formatRupiah(sisa)}`
        : "",
    alamat: alamatPelanggan,
    alamat_toko: alamatToko,
    metode_info: metodeInfo,
    catatan_info: trx?.catatan ? `Catatan: ${trx.catatan}\n` : "",
    syarat: settings.syarat || DEFAULT_SYARAT,
    kasir: settings.kasir || "Kasir"
  };
}

function buildWaMessage(stage, trx, settings = {}, items = []) {
  const templates = getWaTemplates(settings);
  const template = stage === "masuk" ? templates.masuk : templates.siap;
  const data = buildWaData(stage, trx, settings, items);
  return renderWaTemplate(template, data).trim();
}

function buildWaUrl(stage, trx, settings = {}, items = []) {
  const phone = normalizeWhatsAppPhone(trx?.noHp);
  if (!phone) return "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(
    buildWaMessage(stage, trx, settings, items)
  )}`;
}

/**
 * Data contoh untuk pratinjau template di halaman Pengaturan.
 * Tidak membaca database.
 */
function getWaPreviewData(settings = {}) {
  const besok = new Date();
  besok.setDate(besok.getDate() + 1);
  besok.setHours(17, 0, 0, 0);

  const sampleTrx = {
    id: "KIA-2610-001",
    namaCustomer: "Ibu Sari",
    noHp: "081234567890",
    alamat: "Jl. Buah Batu No. 12, Gang Mawar",
    layanan: "cuci-setrika",
    berat: 5.5,
    totalHarga: 90000,
    jumlahDibayar: 40000,
    statusBayar: "dp",
    metodePenyerahan: "antar",
    estimasiSelesai: besok.toISOString(),
    catatan: "Pewangi ekstra, pisahkan kain putih"
  };

  const sampleItems = [
    { jenis: "Kemeja", jumlah: 3 },
    { jenis: "Celana", jumlah: 2 },
    { jenis: "Kaos", jumlah: 3 }
  ];

  return buildWaData("siap", sampleTrx, settings, sampleItems);
}
