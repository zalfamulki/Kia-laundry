/**
 * KIA LAUNDRY — Dashboard Logic
 * Memuat ringkasan operasional hari ini, pakaian siap diambil,
 * pakaian lewat estimasi, dan fitur tracking status real-time.
 */

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("dashboard");
  renderFooter();

  try {
    await initDB();
    await loadDashboardStats();
    await loadAlerts();
    await loadBelumLunas();
  } catch (err) {
    console.error("Gagal memuat data dashboard:", err);
    showToast("Gagal menginisialisasi data lokal.", "error");
  }

  // Kolom pencarian tracking di atas foto mesin cuci
  const trackingForm = document.getElementById("trackingForm");
  if (trackingForm) {
    trackingForm.addEventListener("submit", handleTrackingSearch);
  }
});

// 1. Memuat statistik ringkasan hari ini
async function loadDashboardStats() {
  const allTrx = (await db.transaksi.toArray()).filter((t) => !t.deletedAt);
  const allPakaian = await db.pakaian.toArray();

  const todayStr = new Date().toISOString().slice(0, 10);

  // Transaksi masuk hari ini
  const trxHariIni = allTrx.filter((t) => t.tanggalMasuk && t.tanggalMasuk.startsWith(todayStr));
  
  // Total pakaian dalam proses (status != 'diambil')
  const pakaianProses = allPakaian.filter((p) => {
    const parent = allTrx.find((t) => t.id === p.transaksiId);
    return parent && parent.status !== "diambil";
  });

  // Siap diambil
  const siapDiambil = allTrx.filter((t) => t.status === "siap");

  // Total omzet hari ini
  const omzetHariIni = trxHariIni.reduce((acc, t) => acc + (Number(t.totalHarga) || 0), 0);

  // Belum lunas / masih ada sisa tagihan (DP ikut dihitung)
  const belumBayar = allTrx.filter((t) =>
    typeof getSisaTagihan === "function"
      ? getSisaTagihan(t) > 0
      : t.statusBayar === "belum"
  );

  // Update UI Element Counters (Murni data riil, default 0 tanpa angka dummy)
  const elTrxHariIni = document.getElementById("statTrxHariIni");
  if (elTrxHariIni) elTrxHariIni.textContent = trxHariIni.length;

  const elPakaianProses = document.getElementById("statPakaianProses");
  if (elPakaianProses) elPakaianProses.textContent = pakaianProses.length;

  const elSiapDiambil = document.getElementById("statSiapDiambil");
  if (elSiapDiambil) elSiapDiambil.textContent = siapDiambil.length;

  const elOmzetHariIni = document.getElementById("statOmzetHariIni");
  if (elOmzetHariIni) {
    elOmzetHariIni.textContent = formatRupiah(omzetHariIni);
  }

  const elBelumBayar = document.getElementById("statBelumBayar");
  if (elBelumBayar) elBelumBayar.textContent = belumBayar.length;
}

// 2. Memuat daftar Pakaian Siap Antar/Ambil & Lewat Estimasi
async function loadAlerts() {
  const allTrx = (await db.transaksi.toArray()).filter((t) => !t.deletedAt);
  const allPakaian = await db.pakaian.toArray();
  const settings = (await db.pengaturan.get("app")) || {};
  const now = new Date();

  // Siap Antar/Ambil
  const listSiap = allTrx.filter((t) => t.status === "siap");
  const containerSiap = document.getElementById("listSiapDiambil");

  if (containerSiap) {
    if (listSiap.length === 0) {
      containerSiap.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem 0;">
          <p>Belum ada cucian yang siap diantar/diambil saat ini.</p>
        </div>
      `;
    } else {
      containerSiap.innerHTML = listSiap
        .slice(0, 5)
        .map((t) => {
          const items = allPakaian.filter((p) => p.transaksiId === t.id);
          const waUrl =
            typeof buildWaUrl === "function"
              ? buildWaUrl("siap", t, settings, items)
              : (() => {
                  const phone =
                    typeof normalizeWhatsAppPhone === "function"
                      ? normalizeWhatsAppPhone(t.noHp)
                      : String(t.noHp || "").replace(/\D/g, "").replace(/^0/, "62");
                  return phone
                    ? `https://wa.me/${phone}?text=${encodeURIComponent(
                        `Halo Kak ${t.namaCustomer || ""}, cucian Anda dengan No ${t.id} di KIA Laundry sudah selesai dan siap diantar/diambil. Total: ${formatRupiah(t.totalHarga)}.`
                      )}`
                    : "";
                })();

          return `
            <div class="alert-item">
              <div class="alert-info">
                <h5>${t.namaCustomer} <span class="badge badge-siap">Siap</span></h5>
                <span>${t.id} • ${formatRupiah(t.totalHarga)} • ${t.layanan}</span>
              </div>
              <div style="display:flex; gap:0.4rem;">
                ${
                  waUrl
                    ? `<a href="${waUrl}" target="_blank" class="btn btn-sm btn-success" title="Hubungi via WhatsApp">
                  WA Notif
                </a>`
                    : ""
                }
                <button class="btn btn-sm btn-outline" onclick="tandaiDiambil('${t.id}')">
                  Serahkan
                </button>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  // Lewat Estimasi
  const listOverdue = allTrx.filter((t) => {
    if (t.status === "siap" || t.status === "diambil") return false;
    if (!t.estimasiSelesai) return false;
    const est = new Date(t.estimasiSelesai);
    return est < now;
  });

  const containerOverdue = document.getElementById("listOverdue");
  if (containerOverdue) {
    if (listOverdue.length === 0) {
      containerOverdue.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem 0;">
          <p style="color: #059669;">Hebat! Semua pesanan cucian berjalan tepat waktu.</p>
        </div>
      `;
    } else {
      containerOverdue.innerHTML = listOverdue
        .slice(0, 5)
        .map((t) => {
          return `
            <div class="alert-item" style="border-left: 4px solid var(--status-danger);">
              <div class="alert-info">
                <h5>${t.namaCustomer} <span class="badge badge-belum">Lewat Target</span></h5>
                <span>${t.id} • Target: ${formatTanggal(t.estimasiSelesai, true)}</span>
              </div>
              <a href="./pages/proses.html" class="btn btn-sm btn-outline-primary">
                Cek Proses
              </a>
            </div>
          `;
        })
        .join("");
    }
  }
}

// Cepat tandai cucian sudah diambil
// Status pembayaran tidak diubah di sini; keputusan Lunas dilakukan di Proses/Laporan.
async function tandaiDiambil(trxId) {
  if (confirm(`Konfirmasi penyerahan cucian untuk transaksi ${trxId}?\n\nStatus pembayaran tidak berubah. Tandai Lunas secara terpisah bila sudah dibayar.`)) {
    await db.transaksi.update(trxId, {
      status: "diambil",
      diambilAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    showToast("Transaksi berhasil ditandai telah diambil!", "success");
    await loadDashboardStats();
    await loadAlerts();
    await loadBelumLunas();
  }
}

// 3. Task 4 — daftar tagihan yang belum lunas
async function loadBelumLunas() {
  const section = document.getElementById("belumLunasSection");
  const container = document.getElementById("listBelumLunas");
  if (!section || !container) return;

  const allTrx = (await db.transaksi.toArray()).filter((t) => !t.deletedAt);
  const unpaid = allTrx
    .map((t) => ({ trx: t, sisa: typeof getSisaTagihan === "function" ? getSisaTagihan(t) : 0 }))
    .filter((row) => row.sisa > 0)
    .sort((a, b) => String(b.trx.tanggalMasuk || "").localeCompare(String(a.trx.tanggalMasuk || "")));

  if (unpaid.length === 0) {
    section.hidden = true;
    container.innerHTML = "";
    return;
  }

  const totalSisa = unpaid.reduce((sum, row) => sum + row.sisa, 0);

  container.innerHTML = `
    <div class="belum-lunas-total">
      <span>${unpaid.length} transaksi belum lunas</span>
      <strong>${formatRupiah(totalSisa)}</strong>
    </div>
    ${unpaid
      .slice(0, 5)
      .map(({ trx, sisa }) => {
        const dibayar =
          typeof getJumlahDibayar === "function" ? getJumlahDibayar(trx) : 0;
        return `
          <div class="belum-lunas-item">
            <div class="belum-lunas-info">
              <div class="belum-lunas-name">${escapeHtml(trx.namaCustomer || "-")}</div>
              <div class="belum-lunas-meta">
                ${escapeHtml(trx.id)} • ${escapeHtml(formatLayananLabel(trx.layanan))} • Total ${formatRupiah(trx.totalHarga)}
                ${dibayar > 0 ? ` • Dibayar ${formatRupiah(dibayar)}` : ""}
              </div>
            </div>
            <div class="belum-lunas-amount">${formatRupiah(sisa)}</div>
            <a href="./pages/proses.html" class="btn btn-sm btn-outline-primary">Lihat</a>
          </div>
        `;
      })
      .join("")}
    ${
      unpaid.length > 5
        ? `<div class="belum-lunas-more"><a href="./pages/laporan.html">Lihat ${unpaid.length - 5} transaksi lainnya</a></div>`
        : ""
    }
  `;
  section.hidden = false;
}

// Tracking Status Cepat
async function handleTrackingSearch(e) {
  e.preventDefault();
  const input = document.getElementById("trackingInput");
  const query = (input ? input.value : "").trim().toLowerCase();

  if (!query) {
    showToast("Masukkan No. Transaksi atau No. WhatsApp Anda.", "warning");
    return;
  }

  const matches = await db.transaksi
    .filter(
      (t) =>
        !t.deletedAt &&
        (t.id.toLowerCase().includes(query) ||
          (t.noHp && t.noHp.includes(query)) ||
          (t.namaCustomer && t.namaCustomer.toLowerCase().includes(query)))
    )
    .toArray();

  if (matches.length === 0) {
    showModal(
      "Hasil Pencarian Status",
      `<div class="empty-state">
        <p>Tidak ditemukan data transaksi dengan kata kunci <strong>"${query}"</strong>.</p>
        <p class="form-help">Pastikan nomor transaksi atau nomor HP sudah benar.</p>
      </div>`
    );
    return;
  }

  const pakaianList = await db.pakaian.toArray();

  const resultsHtml = matches
    .map((t) => {
      const items = pakaianList.filter((p) => p.transaksiId === t.id);
      const itemsHtml = items
        .map(
          (p) => `
          <div style="display:flex; align-items:center; gap:0.75rem; margin-top:0.5rem; background:#f8fafc; padding:0.5rem; border-radius:8px;">
            <img src="${p.fotoThumb || p.foto || './assets/icon.svg'}" style="width:48px; height:48px; object-fit:cover; border-radius:6px;">
            <div>
              <div style="font-weight:700; font-size:0.9rem;">${p.jenis} (${p.warna || '-'})</div>
              <div style="font-size:0.78rem; color:#64748b;">${p.kondisi ? `Kondisi: ${p.kondisi}` : 'Kondisi baik'} • ${p.jumlah} pcs</div>
            </div>
          </div>
        `
        )
        .join("");

      return `
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
            <div>
              <h4 style="font-size:1.05rem; font-weight:800; color:#0f172a;">${t.id}</h4>
              <p style="font-size:0.85rem; color:#64748b;">Pelanggan: <strong>${t.namaCustomer}</strong> (${t.noHp})</p>
            </div>
            <div>${getStatusBadge(t.status)}</div>
          </div>
          <div style="font-size:0.85rem; color:#475569; display:grid; grid-template-columns:1fr 1fr; gap:0.4rem; margin:0.5rem 0;">
            <div>Layanan: <strong>${t.layanan.toUpperCase()}</strong></div>
            <div>Estimasi: <strong>${formatTanggal(t.estimasiSelesai, true)}</strong></div>
            <div>Total: <strong>${formatRupiah(t.totalHarga)}</strong></div>
            <div>Bayar: ${getBayarBadge(t.statusBayar)}</div>
          </div>
          <div style="margin-top:0.75rem;">
            <div style="font-size:0.8rem; font-weight:700; color:#64748b; text-transform:uppercase;">Pakaian Terdata (${items.length}):</div>
            ${itemsHtml || '<p style="font-size:0.8rem; color:#94a3b8;">Belum ada rincian pakaian.</p>'}
          </div>
        </div>
      `;
    })
    .join("");

  showModal("Status Cucian Anda", `<div style="max-height: 60vh; overflow-y:auto;">${resultsHtml}</div>`);
}
