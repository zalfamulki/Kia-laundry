/**
 * KIA LAUNDRY — Logika Form Transaksi Masuk
 * Menangani autocomplete customer, kalkulasi harga otomatis,
 * entri pakaian dengan foto & kompresi canvas, serta cetak struk nota POS.
 */

let activeSettings = null;
let keranjangPakaian = [];
let currentFotoItem = null; // { foto, fotoThumb, sizeKb }
const kamera = new KameraManager();

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("transaksi");
  renderFooter();

  try {
    await initDB();
    activeSettings = (await db.pengaturan.get("app")) || {};
    setupDefaultDates();
    setupAutocomplete();
    setupEventListeners();
  } catch (err) {
    console.error("Gagal inisialisasi halaman transaksi:", err);
    showToast("Gagal memuat pengaturan database.", "error");
  }
});

// Set default tanggal masuk (sekarang) & estimasi selesai (+2 hari jam 17:00)
function setupDefaultDates() {
  const now = new Date();
  const formatInputDateTime = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`;
  };

  const elTglMasuk = document.getElementById("tanggalMasuk");
  if (elTglMasuk) elTglMasuk.value = formatInputDateTime(now);

  const est = new Date();
  est.setDate(est.getDate() + 2);
  est.setHours(17, 0, 0, 0);

  const elEstSelesai = document.getElementById("estimasiSelesai");
  if (elEstSelesai) elEstSelesai.value = formatInputDateTime(est);
}

// Autocomplete data customer lama
async function setupAutocomplete() {
  const inputNama = document.getElementById("namaCustomer");
  const inputHp = document.getElementById("noHp");
  const inputAlamat = document.getElementById("alamat");
  const dropdown = document.getElementById("customerSuggestions");

  if (!inputNama || !inputHp || !dropdown) return;

  const handleSearch = async (query) => {
    if (!query || query.length < 2) {
      dropdown.style.display = "none";
      return;
    }

    const customers = await db.customer
      .filter(
        (c) =>
          (c.nama && c.nama.toLowerCase().includes(query.toLowerCase())) ||
          (c.noHp && c.noHp.includes(query))
      )
      .limit(5)
      .toArray();

    if (customers.length === 0) {
      dropdown.style.display = "none";
      return;
    }

    dropdown.innerHTML = customers
      .map(
        (c) => `
        <div class="autocomplete-item" data-id="${c.id}">
          <div>
            <strong>${c.nama}</strong>
            <span style="color:#64748b; font-size:0.8rem; margin-left:0.5rem;">(${c.noHp})</span>
          </div>
          <span style="color:#0284c7; font-size:0.75rem; font-weight:700;">${c.totalTransaksi || 0} order</span>
        </div>
      `
      )
      .join("");

    dropdown.style.display = "block";

    // Click on suggestion
    dropdown.querySelectorAll(".autocomplete-item").forEach((item) => {
      item.addEventListener("click", () => {
        const id = item.getAttribute("data-id");
        const found = customers.find((c) => c.id === id);
        if (found) {
          inputNama.value = found.nama;
          inputHp.value = found.noHp;
          if (inputAlamat && found.alamat) inputAlamat.value = found.alamat;
        }
        dropdown.style.display = "none";
      });
    });
  };

  inputNama.addEventListener("input", (e) => handleSearch(e.target.value));
  inputHp.addEventListener("input", (e) => handleSearch(e.target.value));

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== inputNama && e.target !== inputHp) {
      dropdown.style.display = "none";
    }
  });
}

// Event Listeners (Kalkulasi, Kamera, Tambah Pakaian, Simpan)
function setupEventListeners() {
  const layananSelect = document.getElementById("layananSelect");
  const beratInput = document.getElementById("beratInput");
  const totalHargaInput = document.getElementById("totalHargaInput");
  const statusBayarSelect = document.getElementById("statusBayarSelect");
  const jumlahDibayarInput = document.getElementById("jumlahDibayarInput");

  // Kalkulasi harga otomatis
  const recalculatePrice = () => {
    const layanan = layananSelect.value;
    const berat = parseFloat(beratInput.value) || 0;
    const hargaConfig = activeSettings?.harga || {};

    let total = 0;
    if (layanan === "cuci-setrika") {
      total = berat * (hargaConfig.cuciSetrika || 9000);
    } else if (layanan === "cuci") {
      total = berat * (hargaConfig.cuci || 6000);
    } else if (layanan === "setrika") {
      total = berat * (hargaConfig.setrika || 5000);
    } else if (layanan === "satuan") {
      // Hitung dari akumulasi pakaian satuan di keranjang
      total = keranjangPakaian.reduce((acc, p) => {
        const itemPrice = hargaConfig.satuan?.[p.jenis.toLowerCase()] || 10000;
        return acc + itemPrice * (p.jumlah || 1);
      }, 0);
    }

    if (totalHargaInput) {
      totalHargaInput.value = Math.round(total);
    }
    syncPaymentInputs("status");
  };

  if (layananSelect) {
    layananSelect.addEventListener("change", () => {
      const isKiloan = layananSelect.value !== "satuan";
      document.getElementById("beratGroup").style.display = isKiloan ? "block" : "none";
      recalculatePrice();
    });
  }

  if (beratInput) {
    beratInput.addEventListener("input", recalculatePrice);
  }

  if (totalHargaInput) {
    totalHargaInput.addEventListener("input", updateSummaryUI);
  }

  // Task 4 — sinkronisasi status bayar <-> nominal dibayar
  if (statusBayarSelect) {
    statusBayarSelect.addEventListener("change", () => syncPaymentInputs("status"));
  }

  if (jumlahDibayarInput) {
    jumlahDibayarInput.addEventListener("input", () => syncPaymentInputs("paid"));
  }

  syncPaymentInputs("status");

  // Kamera: Buka Webcam / Live Stream
  const btnStartWebcam = document.getElementById("btnStartWebcam");
  const cameraBox = document.getElementById("cameraBox");
  const cameraVideo = document.getElementById("cameraVideo");
  const btnCaptureFrame = document.getElementById("btnCaptureFrame");
  const btnCancelCamera = document.getElementById("btnCancelCamera");

  if (btnStartWebcam) {
    btnStartWebcam.addEventListener("click", async () => {
      try {
        cameraBox.style.display = "block";
        await kamera.startCamera(cameraVideo);
        showToast("Kamera siap. Arahkan ke pakaian dan klik Ambil Foto.", "info");
      } catch (err) {
        showToast("Kamera tidak aktif atau butuh izin HTTPS. Gunakan tombol Upload.", "warning");
        cameraBox.style.display = "none";
      }
    });
  }

  if (btnCaptureFrame) {
    btnCaptureFrame.addEventListener("click", async () => {
      try {
        currentFotoItem = await kamera.captureFrame();
        kamera.stopCamera();
        cameraBox.style.display = "none";
        renderFotoPreview();
        showToast(`Foto berhasil diambil & dikompres (${currentFotoItem.sizeKb} KB).`, "success");
      } catch (err) {
        showToast("Gagal mengambil foto: " + err.message, "error");
      }
    });
  }

  if (btnCancelCamera) {
    btnCancelCamera.addEventListener("click", () => {
      kamera.stopCamera();
      cameraBox.style.display = "none";
    });
  }

  // Upload Foto dari File / Galeri HP
  const fileUploadInput = document.getElementById("fileUploadInput");
  if (fileUploadInput) {
    fileUploadInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        showToast("Mengompres foto...", "info");
        currentFotoItem = await KameraManager.compressImage(file);
        renderFotoPreview();
        showToast(`Foto berhasil diproses (${currentFotoItem.sizeKb} KB).`, "success");
      } catch (err) {
        showToast("Gagal memproses file foto.", "error");
      }
    });
  }

  // Tambah Pakaian ke Keranjang
  const btnTambahPakaian = document.getElementById("btnTambahPakaian");
  if (btnTambahPakaian) {
    btnTambahPakaian.addEventListener("click", () => {
      const jenis = document.getElementById("pakaianJenis").value.trim();
      const warna = document.getElementById("pakaianWarna").value.trim();
      const merek = document.getElementById("pakaianMerek").value.trim();
      const jumlah = parseInt(document.getElementById("pakaianJumlah").value, 10) || 1;
      const kondisi = document.getElementById("pakaianKondisi").value.trim();

      if (!jenis) {
        showToast("Pilih atau isi jenis pakaian terlebih dahulu.", "warning");
        document.getElementById("pakaianJenis").focus();
        return;
      }

      const itemPakaian = {
        id: "PCN-" + Date.now().toString(36) + Math.random().toString(36).substr(2, 3),
        jenis,
        warna: warna || "-",
        merek: merek || "",
        jumlah,
        kondisi: kondisi || "Kondisi baik",
        foto: currentFotoItem ? currentFotoItem.foto : null,
        fotoThumb: currentFotoItem ? currentFotoItem.fotoThumb : null,
        createdAt: new Date().toISOString()
      };

      keranjangPakaian.push(itemPakaian);
      renderKeranjangPakaian();

      // Reset form item pakaian
      document.getElementById("pakaianJenis").value = "";
      document.getElementById("pakaianWarna").value = "";
      document.getElementById("pakaianMerek").value = "";
      document.getElementById("pakaianKondisi").value = "";
      document.getElementById("pakaianJumlah").value = "1";
      currentFotoItem = null;
      renderFotoPreview();

      recalculatePrice();
      showToast(`${jenis} berhasil ditambahkan ke rincian!`, "success");
    });
  }

  // Submit Transaksi Utama
  const mainForm = document.getElementById("formTransaksiUtama");
  if (mainForm) {
    mainForm.addEventListener("submit", handleSimpanTransaksi);
  }
}

// Render Preview Foto yang baru diambil/diupload
function renderFotoPreview() {
  const container = document.getElementById("fotoPreviewContainer");
  if (!container) return;

  if (!currentFotoItem) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="photo-preview-card">
      <img src="${currentFotoItem.fotoThumb || currentFotoItem.foto}" alt="Preview">
      <button type="button" class="photo-delete-btn" title="Hapus foto" onclick="hapusFotoPreview()">&times;</button>
    </div>
    <div style="font-size:0.75rem; color:#059669; font-weight:700; margin-top:0.25rem;">
      Tersimpan (${currentFotoItem.sizeKb} KB)
    </div>
  `;
}

function hapusFotoPreview() {
  currentFotoItem = null;
  renderFotoPreview();
  const fileInput = document.getElementById("fileUploadInput");
  if (fileInput) fileInput.value = "";
}

// Render Daftar Pakaian di Keranjang Transaksi
function renderKeranjangPakaian() {
  const container = document.getElementById("daftarPakaianContainer");
  const countBadge = document.getElementById("countPakaianBadge");

  const totalPcs = keranjangPakaian.reduce((acc, p) => acc + (p.jumlah || 1), 0);
  if (countBadge) countBadge.textContent = `${totalPcs} Pcs`;

  if (!container) return;

  if (keranjangPakaian.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 1.5rem 0;">
        <p>Belum ada rincian pakaian yang ditambahkan.</p>
        <p class="form-help">Catat jenis, warna, kondisi, dan foto pakaian di atas.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = keranjangPakaian
    .map((p, idx) => `
      <div class="item-pakaian-card">
        <div class="item-pakaian-left">
          <img src="${p.fotoThumb || p.foto || '../assets/icon.svg'}" class="item-pakaian-thumb" alt="Foto">
          <div class="item-pakaian-info">
            <h5>${p.jumlah}x ${p.jenis} <span style="font-weight:400; color:#64748b;">(${p.warna})</span></h5>
            <p>
              ${p.kondisi ? `<strong style="color:#d97706;">* ${p.kondisi}</strong> • ` : ''}
              ${p.merek ? `Merek: ${p.merek} • ` : ''}
              ${p.foto ? '<span style="color:#059669; font-weight:700;">Ada Foto</span>' : '<span style="color:#94a3b8;">Tanpa Foto</span>'}
            </p>
          </div>
        </div>
        <div>
          <button type="button" class="btn btn-sm btn-ghost" style="color:#ef4444;" onclick="hapusItemKeranjang(${idx})" title="Hapus item">
            Hapus
          </button>
        </div>
      </div>
    `)
    .join("");

  updateSummaryUI();
}

function hapusItemKeranjang(idx) {
  keranjangPakaian.splice(idx, 1);
  renderKeranjangPakaian();
}

// Update Ringkasan Total di Sisi Kanan
function updateSummaryUI() {
  const totalHargaInput = document.getElementById("totalHargaInput");
  const total = Number(totalHargaInput?.value) || 0;
  const berat = parseFloat(document.getElementById("beratInput")?.value) || 0;
  const layanan = document.getElementById("layananSelect")?.value || "cuci-setrika";
  const totalPcs = keranjangPakaian.reduce((acc, p) => acc + (p.jumlah || 1), 0);

  const elSumLayanan = document.getElementById("sumLayanan");
  if (elSumLayanan) elSumLayanan.textContent = layanan.toUpperCase();

  const elSumQty = document.getElementById("sumQty");
  if (elSumQty) elSumQty.textContent = `${totalPcs} Pcs ${layanan !== 'satuan' ? `(${berat} Kg)` : ''}`;

  const elSumTotal = document.getElementById("sumTotal");
  if (elSumTotal) elSumTotal.textContent = formatRupiah(total);

  // Task 4 — ringkasan pembayaran (dibayar & sisa)
  const statusBayar = document.getElementById("statusBayarSelect")?.value || "belum";
  const paidRaw = Number(document.getElementById("jumlahDibayarInput")?.value) || 0;
  const payment =
    typeof normalizePayment === "function"
      ? normalizePayment(statusBayar, total, paidRaw)
      : { statusBayar, jumlahDibayar: paidRaw };
  const dibayar = Math.min(payment.jumlahDibayar, total);
  const sisa = Math.max(0, total - dibayar);

  const elSumDibayar = document.getElementById("sumDibayar");
  if (elSumDibayar) elSumDibayar.textContent = formatRupiah(dibayar);

  const elSumSisa = document.getElementById("sumSisa");
  if (elSumSisa) {
    elSumSisa.textContent = formatRupiah(sisa);
    elSumSisa.style.color = sisa > 0 ? "#b91c1c" : "#047857";
  }
}

/**
 * Task 4 — jaga status pembayaran tetap konsisten dengan nominal.
 * source "status": status diubah user, nominal mengikuti.
 * source "paid": nominal diketik user, status menyesuaikan.
 */
function syncPaymentInputs(source = "status") {
  const total = Number(document.getElementById("totalHargaInput")?.value) || 0;
  const statusSelect = document.getElementById("statusBayarSelect");
  const paidInput = document.getElementById("jumlahDibayarInput");
  if (!statusSelect || !paidInput) return;

  if (source === "status") {
    if (statusSelect.value === "lunas") {
      paidInput.value = total;
    } else if (statusSelect.value === "belum") {
      paidInput.value = 0;
    }
  } else {
    const paid = Math.max(0, Number(paidInput.value) || 0);
    if (total > 0 && paid >= total) {
      statusSelect.value = "lunas";
    } else if (paid > 0) {
      statusSelect.value = "dp";
    } else {
      statusSelect.value = "belum";
    }
  }

  updateSummaryUI();
}

// Simpan Transaksi Lengkap ke Database
async function handleSimpanTransaksi(e) {
  e.preventDefault();

  const nama = document.getElementById("namaCustomer").value.trim();
  const noHp = document.getElementById("noHp").value.trim();
  const alamat = document.getElementById("alamat")?.value.trim() || "";
  const layanan = document.getElementById("layananSelect").value;
  const berat = parseFloat(document.getElementById("beratInput")?.value) || 0;
  const tanggalMasuk = document.getElementById("tanggalMasuk").value;
  const estimasiSelesai = document.getElementById("estimasiSelesai").value;
  const statusBayar = document.getElementById("statusBayarSelect").value;
  const jumlahDibayar = Number(document.getElementById("jumlahDibayarInput")?.value) || 0;
  const metodePenyerahan = document.getElementById("metodePenyerahan")?.value || "antar";
  const totalHarga = Number(document.getElementById("totalHargaInput").value) || 0;
  const catatan = document.getElementById("catatanTrans")?.value.trim() || "";

  if (!nama || !noHp) {
    showToast("Nama dan nomor WhatsApp pelanggan wajib diisi.", "warning");
    return;
  }

  // Task 4 — status & nominal pembayaran selalu konsisten
  const payment = normalizePayment(statusBayar, totalHarga, jumlahDibayar);

  if (keranjangPakaian.length === 0) {
    if (!confirm("Pakaian belum dicatat satu per satu. Tetap ingin menyimpan transaksi ini?")) {
      return;
    }
  }

  try {
    const trxId = await generateNextTrxId();

    const transaksiObj = {
      id: trxId,
      tanggalMasuk,
      namaCustomer: nama,
      noHp,
      alamat,
      layanan,
      berat,
      estimasiSelesai,
      status: "masuk",
      statusBayar: payment.statusBayar,
      jumlahDibayar: payment.jumlahDibayar,
      metodePenyerahan,
      totalHarga,
      catatan,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 1. Simpan Transaksi
    await db.transaksi.put(transaksiObj);

    // 2. Simpan Item Pakaian
    for (const p of keranjangPakaian) {
      await db.pakaian.put({
        ...p,
        transaksiId: trxId
      });
    }

    // 3. Upsert data Customer
    await upsertCustomer(nama, noHp, alamat, totalHarga);

    showToast(`Transaksi ${trxId} berhasil disimpan!`, "success");

    // Tampilkan Modal Sukses dengan opsi Cetak & Kirim WA
    // Task 4 — pesan WhatsApp tahap 1 memakai template yang bisa diedit di Pengaturan
    const waUrl =
      typeof buildWaUrl === "function"
        ? buildWaUrl("masuk", transaksiObj, activeSettings, keranjangPakaian)
        : "";

    showModal(
      "Transaksi Berhasil Disimpan",
      `
      <div style="text-align:center; padding:1rem 0;">
        <div style="margin-bottom:0.75rem;">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h3 style="font-size:1.35rem; font-weight:800; color:#0f172a;">${trxId}</h3>
        <p style="color:#64748b; font-size:0.95rem; margin-top:0.25rem;">
          Data ${keranjangPakaian.length} potong pakaian dan customer berhasil disimpan ke IndexedDB lokal.
        </p>
      </div>
      `,
      [
        {
          label: "Cetak Nota Struk",
          className: "btn-primary",
          onClick: () => {
            cetakNotaStruk(transaksiObj, keranjangPakaian, activeSettings);
          }
        },
        {
          label: "Kirim WhatsApp",
          className: "btn-success",
          onClick: () => {
            if (!waUrl) {
              showToast("Nomor WhatsApp pelanggan tidak valid.", "warning");
              return;
            }
            window.open(waUrl, "_blank", "noopener");
          }
        },
        {
          label: "Transaksi Baru",
          className: "btn-yellow",
          onClick: (close) => {
            close();
            window.location.reload();
          }
        }
      ]
    );
  } catch (err) {
    console.error("Gagal menyimpan transaksi:", err);
    showToast("Terjadi kesalahan saat menyimpan transaksi: " + err.message, "error");
  }
}
