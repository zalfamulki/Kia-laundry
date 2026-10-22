/**
 * KIA LAUNDRY — UI Utility & Navigation Renderer
 * Mendukung navigasi konsisten multi-page, notifikasi toast, modal dialog,
 * format rupiah & tanggal, serta cetak struk nota.
 */

// Menentukan path root relatif terhadap lokasi file HTML aktif
function getBasePath() {
  const path = window.location.pathname;
  if (path.includes("/pages/")) {
    return "../";
  }
  return "./";
}

// Render Header & Navigasi
function renderNav(activeKey = "dashboard") {
  const base = getBasePath();
  
  // 1. Top Announcement Bar
  const topBarHtml = `
    <div class="top-bar">
      <div class="top-bar-inner">
        <div class="top-bar-left">
          <span class="top-bar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Buka Setiap Hari: 07:00 - 21:00 WIB
          </span>
          <span class="top-bar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Layanan Antar Jemput Tersedia
          </span>
        </div>
        <div class="top-bar-right">
          <span class="top-bar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <a href="https://wa.me/6285179591769" target="_blank" rel="noopener">0851-7959-1769</a>
          </span>
          <span class="top-bar-item">
            <a href="https://wa.me/628112291769" target="_blank" rel="noopener">0811-2291-769</a>
          </span>
        </div>
      </div>
    </div>
  `;

  // Menu items list
  const navItems = [
    { key: "dashboard", label: "Dashboard", href: `${base}index.html` },
    { key: "transaksi", label: "Transaksi", href: `${base}pages/transaksi.html` },
    { key: "galeri", label: "Galeri Foto", href: `${base}pages/galeri.html` },
    { key: "proses", label: "Proses", href: `${base}pages/proses.html` },
    { key: "customer", label: "Customer", href: `${base}pages/customer.html` },
    { key: "laporan", label: "Laporan", href: `${base}pages/laporan.html` },
    { key: "backup", label: "Backup", href: `${base}pages/backup.html` },
    { key: "pengaturan", label: "Pengaturan", href: `${base}pages/pengaturan.html` }
  ];

  const menuHtml = navItems.map(item => `
    <li>
      <a href="${item.href}" class="nav-link ${activeKey === item.key ? 'active' : ''}">
        ${item.label}
      </a>
    </li>
  `).join("");

  // 2. Main Site Header
  const headerHtml = `
    ${topBarHtml}
    <header class="site-header">
      <div class="nav-container">
        <a href="${base}index.html" class="brand-logo">
          <img src="${base}assets/logo.png" alt="KIA Laundry" onerror="this.src='${base}assets/icon.svg'">
          <span>KIA Laundry</span>
          <span class="brand-badge">Clean & Fresh</span>
        </a>

        <ul class="nav-menu" id="navMenu">
          ${menuHtml}
        </ul>

        <div class="nav-actions">
          <div id="modeBadge" class="mode-indicator online" title="Status Jaringan (Klik untuk info mode)" onclick="window.location.href='${base}pages/pengaturan.html'">
            <span class="status-dot"></span>
            <span class="mode-text">Online</span>
          </div>

          <a href="${base}pages/transaksi.html" class="btn btn-yellow btn-sm">
            <span>+ Transaksi Baru</span>
            <span class="btn-arrow-icon">→</span>
          </a>

          <button class="mobile-toggle" id="mobileToggle" aria-label="Toggle Menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>
    </header>
  `;

  // Sisipkan di element #siteHeader atau awal body
  const headerElem = document.getElementById("siteHeader");
  if (headerElem) {
    headerElem.innerHTML = headerHtml;
  } else {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = headerHtml;
    document.body.insertBefore(tempDiv, document.body.firstChild);
  }

  // Setup mobile menu toggle
  const toggleBtn = document.getElementById("mobileToggle");
  const navMenu = document.getElementById("navMenu");
  if (toggleBtn && navMenu) {
    toggleBtn.addEventListener("click", () => {
      navMenu.classList.toggle("show");
    });
  }

  // Inisialisasi status mode koneksi
  updateModeBadge();
}

// Render Footer & CTA Banner
function renderFooter() {
  const base = getBasePath();
  const footerHtml = `
    <section class="cta-banner no-print">
      <div class="cta-container">
        <div class="cta-text">
          <span class="handwriting" style="color: #fef08a;">Semua Bisa Bersih & Segar!</span>
          <h2>Pakaian Rapi, Bersih, & Wangi Tanpa Ribet</h2>
          <p>Layanan cuci satuan & kiloan dengan dokumentasi foto real-time agar pakaian pelanggan tidak pernah tertukar atau terlupa.</p>
        </div>
        <div class="cta-action">
          <a href="https://wa.me/6285179591769" target="_blank" class="btn btn-yellow">
            <span>Chat WhatsApp 1</span>
            <span class="btn-arrow-icon">→</span>
          </a>
          <a href="https://wa.me/628112291769" target="_blank" class="btn btn-outline" style="background: rgba(255,255,255,0.15); color: #fff; border-color: rgba(255,255,255,0.4);">
            <span>WhatsApp 2 (Antar Jemput)</span>
          </a>
        </div>
      </div>
    </section>

    <footer class="site-footer no-print">
      <div class="footer-container">
        <div class="footer-brand">
          <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom: 0.8rem;">
            <img src="${base}assets/logo.png" alt="KIA Laundry" style="width:38px; height:38px; border-radius:50%;" onerror="this.src='${base}assets/icon.svg'">
            <h3 style="margin-bottom:0;">KIA LAUNDRY</h3>
          </div>
          <p>Aplikasi operasional laundry lokal & offline-ready dengan sistem foto dokumentasi pakaian untuk menjaga kepercayaan dan kepuasan pelanggan.</p>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:1rem;">
            <span class="pill-service" style="background:#1e293b; color:#38bdf8;">Layanan Antar Jemput</span>
            <span class="pill-service" style="background:#1e293b; color:#facc15;">Cuci Kiloan & Satuan</span>
            <span class="pill-service" style="background:#1e293b; color:#a7f3d0;">IndexedDB Offline Ready</span>
          </div>
        </div>

        <div class="footer-links">
          <h4>Menu Utama</h4>
          <ul>
            <li><a href="${base}index.html">Dashboard Utama</a></li>
            <li><a href="${base}pages/transaksi.html">Transaksi Masuk</a></li>
            <li><a href="${base}pages/galeri.html">Galeri Foto Pakaian</a></li>
            <li><a href="${base}pages/proses.html">Monitoring Proses</a></li>
          </ul>
        </div>

        <div class="footer-links">
          <h4>Manajemen</h4>
          <ul>
            <li><a href="${base}pages/customer.html">Database Customer</a></li>
            <li><a href="${base}pages/laporan.html">Laporan & Export Excel</a></li>
            <li><a href="${base}pages/backup.html">Backup / Restore JSON</a></li>
            <li><a href="${base}pages/pengaturan.html">Pengaturan & Harga</a></li>
          </ul>
        </div>

        <div class="footer-links">
          <h4>Kontak & Lokasi</h4>
          <p style="font-size:0.85rem; margin-bottom:0.5rem; color:#cbd5e1;"><strong>KIA Laundry Clean & Fresh</strong></p>
          <p style="font-size:0.85rem; margin-bottom:0.5rem;">WhatsApp 1: 0851-7959-1769</p>
          <p style="font-size:0.85rem; margin-bottom:0.5rem;">WhatsApp 2: 0811-2291-769</p>
          <p style="font-size:0.85rem; color:#94a3b8;">Buka Setiap Hari: 07.00 - 21.00 WIB</p>
        </div>
      </div>

      <div class="footer-bottom">
        <div>© ${new Date().getFullYear()} KIA Laundry. Clean & Fresh. Seluruh hak cipta dilindungi.</div>
        <div style="display:flex; gap:1.5rem;">
          <span>Sistem Lokal Browser (Tanpa Server)</span>
          <span>Privacy & Data Aman</span>
        </div>
      </div>
    </footer>
  `;

  const footerElem = document.getElementById("siteFooter");
  if (footerElem) {
    footerElem.innerHTML = footerHtml;
  } else {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = footerHtml;
    document.body.appendChild(tempDiv);
  }
}

// Update status koneksi online/offline
function updateModeBadge() {
  const badge = document.getElementById("modeBadge");
  if (!badge) return;

  const isOnline = navigator.onLine;
  const pref = localStorage.getItem("kia_mode_pref") || "auto";

  if (pref === "offline" || (!isOnline && pref === "auto")) {
    badge.className = "mode-indicator offline";
    badge.innerHTML = `<span class="status-dot"></span><span class="mode-text">Mode Offline</span>`;
  } else {
    badge.className = "mode-indicator online";
    badge.innerHTML = `<span class="status-dot"></span><span class="mode-text">Online</span>`;
  }
}

window.addEventListener("online", updateModeBadge);
window.addEventListener("offline", updateModeBadge);

// Toast Notification
function showToast(message, type = "info") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Modal Dialog
function showModal(title, contentHtml, buttons = []) {
  let backdrop = document.getElementById("customModalBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "customModalBackdrop";
    backdrop.className = "modal-backdrop";
    document.body.appendChild(backdrop);
  }

  const footerButtonsHtml = buttons.map((btn, idx) => `
    <button type="button" class="btn ${btn.className || 'btn-outline'}" id="modalBtn_${idx}">
      ${btn.label}
    </button>
  `).join("");

  backdrop.innerHTML = `
    <div class="modal-container" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        ${contentHtml}
      </div>
      <div class="modal-footer">
        ${footerButtonsHtml || '<button type="button" class="btn btn-outline" onclick="closeModal()">Tutup</button>'}
      </div>
    </div>
  `;

  // Attach button click events
  buttons.forEach((btn, idx) => {
    const btnElem = document.getElementById(`modalBtn_${idx}`);
    if (btnElem && btn.onClick) {
      btnElem.addEventListener("click", () => btn.onClick(closeModal));
    }
  });

  backdrop.classList.add("show");
}

function closeModal() {
  const backdrop = document.getElementById("customModalBackdrop");
  if (backdrop) {
    backdrop.classList.remove("show");
  }
}

// Formatter Helpers
function formatRupiah(amount) {
  const num = Number(amount) || 0;
  return "Rp " + num.toLocaleString("id-ID");
}

function formatTanggal(isoString, withTime = false) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const opt = {
    day: "numeric",
    month: "short",
    year: "numeric"
  };
  if (withTime) {
    opt.hour = "2-digit";
    opt.minute = "2-digit";
  }
  return date.toLocaleDateString("id-ID", opt);
}

function getStatusBadge(status) {
  const map = {
    masuk: { label: "Masuk", class: "badge-masuk" },
    dicuci: { label: "Dicuci", class: "badge-cuci" },
    disetrika: { label: "Disetrika", class: "badge-setrika" },
    siap: { label: "Siap Diambil", class: "badge-siap" },
    diambil: { label: "Sudah Diambil", class: "badge-diambil" }
  };
  const item = map[status] || { label: status, class: "badge-masuk" };
  return `<span class="badge ${item.class}"><span class="badge-dot"></span>${item.label}</span>`;
}

function getBayarBadge(statusBayar) {
  const map = {
    lunas: { label: "Lunas", class: "badge-lunas" },
    dp: { label: "DP", class: "badge-dp" },
    belum: { label: "Belum Bayar", class: "badge-belum" }
  };
  const item = map[statusBayar] || { label: statusBayar, class: "badge-belum" };
  return `<span class="badge ${item.class}">${item.label}</span>`;
}

// Cetak Struk Nota Standar POS
function cetakNotaStruk(transaksi, pakaianList = [], settings = {}) {
  const printWindow = window.open("", "_blank", "width=400,height=600");
  const namaToko = settings.namaLaundry || "KIA LAUNDRY";
  const alamat = settings.alamat || "Layanan Antar Jemput";
  const noHp = settings.noHp1 || "085179591769";

  const rowsHtml = pakaianList.map(p => `
    <tr>
      <td style="padding: 3px 0;">${p.jumlah}x ${p.jenis} (${p.warna || '-'})</td>
      <td style="text-align: right; padding: 3px 0;">${p.kondisi ? `*${p.kondisi}` : ''}</td>
    </tr>
  `).join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Nota - ${transaksi.id}</title>
      <style>
        body {
          font-family: 'Courier New', Courier, monospace;
          width: 72mm;
          margin: 0 auto;
          padding: 8px;
          font-size: 11px;
          color: #000;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .line { border-bottom: 1px dashed #000; margin: 6px 0; }
        .title { font-size: 15px; font-weight: bold; margin-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body onload="window.print(); window.close();">
      <div class="text-center">
        <div class="title">${namaToko}</div>
        <div>CLEAN & FRESH</div>
        <div>${alamat}</div>
        <div>Telp/WA: ${noHp}</div>
      </div>
      <div class="line"></div>
      <div>No. Nota  : <strong>${transaksi.id}</strong></div>
      <div>Tanggal   : ${formatTanggal(transaksi.tanggalMasuk, true)}</div>
      <div>Pelanggan : ${transaksi.namaCustomer} (${transaksi.noHp})</div>
      <div>Layanan   : ${transaksi.layanan.toUpperCase()}</div>
      <div>Est. Selesai: ${formatTanggal(transaksi.estimasiSelesai, true)}</div>
      <div class="line"></div>
      <table>
        <thead>
          <tr>
            <th style="text-align: left;">Rincian Pakaian</th>
            <th style="text-align: right;">Kondisi Awal</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="2">Pakaian terdata dalam sistem</td></tr>'}
        </tbody>
      </table>
      <div class="line"></div>
      ${transaksi.berat ? `<div>Berat: ${transaksi.berat} Kg</div>` : ''}
      <div style="font-size: 13px; font-weight: bold; display: flex; justify-content: space-between;">
        <span>TOTAL:</span>
        <span>${formatRupiah(transaksi.totalHarga)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>STATUS BAYAR:</span>
        <span>${(transaksi.statusBayar || '').toUpperCase()}</span>
      </div>
      <div class="line"></div>
      <div class="text-center" style="font-size: 10px;">
        * Foto kondisi pakaian disimpan dalam sistem kami.<br>
        * Pengambilan wajib menunjukkan nota/WA.<br>
        Terima Kasih Atas Kepercayaan Anda!
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
