/**
 * KIA LAUNDRY — Customer Management Logic
 * Menyajikan direktori pelanggan, riwayat transaksi lengkap,
 * foto pakaian pelanggan, dan direct chat WhatsApp.
 */

let customerList = [];
let transaksiList = [];
let pakaianList = [];

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("customer");
  renderFooter();

  try {
    await initDB();
    await loadCustomerData();
    setupCustomerSearch();
  } catch (err) {
    console.error("Gagal memuat customer:", err);
    showToast("Gagal memuat data pelanggan.", "error");
  }
});

async function loadCustomerData() {
  customerList = await db.customer.toArray();
  transaksiList = await db.transaksi.toArray();
  pakaianList = await db.pakaian.toArray();

  renderCustomerTable(customerList);
  updateCustomerMetrics();
}

function updateCustomerMetrics() {
  const totalCus = customerList.length;
  const repeatCus = customerList.filter((c) => (c.totalTransaksi || 0) > 1).length;
  const totalOmzet = customerList.reduce((acc, c) => acc + (Number(c.totalBelanja) || 0), 0);

  const elTotal = document.getElementById("metricTotalCustomer");
  if (elTotal) elTotal.textContent = totalCus;

  const elRepeat = document.getElementById("metricRepeatCustomer");
  if (elRepeat) elRepeat.textContent = repeatCus;

  const elOmzet = document.getElementById("metricTotalBelanja");
  if (elOmzet) elOmzet.textContent = formatRupiah(totalOmzet);
}

function renderCustomerTable(list) {
  const tbody = document.getElementById("customerTableBody");
  const countBadge = document.getElementById("customerCountBadge");

  if (countBadge) countBadge.textContent = `${list.length} Pelanggan`;
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:2.5rem; color:#64748b;">
          Tidak ada data customer yang cocok.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list
    .map((c, idx) => {
      const initials = (c.nama || "C")
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase();

      const waUrl = `https://wa.me/62${(c.noHp || "").replace(/^0/, "")}`;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <div class="customer-avatar-badge">${initials}</div>
              <div>
                <strong style="color:var(--text-main); font-size:0.95rem;">${c.nama}</strong>
                <div style="font-size:0.78rem; color:var(--text-muted);">${c.alamat || 'Alamat belum diisi'}</div>
              </div>
            </div>
          </td>
          <td>
            <a href="${waUrl}" target="_blank" style="color:var(--primary); font-weight:700;">
              ${c.noHp}
            </a>
          </td>
          <td>
            <span class="badge ${c.totalTransaksi > 1 ? 'badge-lunas' : 'badge-masuk'}">
              ${c.totalTransaksi || 1} Order
            </span>
          </td>
          <td style="font-weight:800; color:var(--text-main);">
            ${formatRupiah(c.totalBelanja || 0)}
          </td>
          <td style="text-align:right;">
            <button class="btn btn-sm btn-outline-primary" onclick="openCustomerDetail('${c.id}')">
              Riwayat & Foto →
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function setupCustomerSearch() {
  const searchInput = document.getElementById("searchCustomerInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = customerList.filter(
      (c) =>
        (c.nama && c.nama.toLowerCase().includes(q)) ||
        (c.noHp && c.noHp.includes(q)) ||
        (c.alamat && c.alamat.toLowerCase().includes(q))
    );
    renderCustomerTable(filtered);
  });
}

// Buka Modal Detail Riwayat & Pakaian Customer
function openCustomerDetail(customerId) {
  const cus = customerList.find((c) => c.id === customerId);
  if (!cus) return;

  const historyTrx = transaksiList.filter((t) => t.noHp === cus.noHp || t.namaCustomer === cus.nama);
  const trxIds = historyTrx.map((t) => t.id);
  const historyPkn = pakaianList.filter((p) => trxIds.includes(p.transaksiId));

  const trxRows = historyTrx
    .map(
      (t) => `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.75rem; margin-bottom:0.65rem;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:0.95rem;">${t.id}</strong>
          <div>${getStatusBadge(t.status)}</div>
        </div>
        <div style="font-size:0.8rem; color:#64748b; margin-top:0.25rem;">
          Tanggal: ${formatTanggal(t.tanggalMasuk, true)} • Layanan: ${t.layanan.toUpperCase()} • Total: <strong>${formatRupiah(t.totalHarga)}</strong>
        </div>
      </div>
    `
    )
    .join("");

  const pknGrid = historyPkn
    .slice(0, 8)
    .map(
      (p) => `
      <div style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; background:#fff;">
        <img src="${p.fotoThumb || p.foto || '../assets/icon.svg'}" style="width:100%; height:90px; object-fit:cover;">
        <div style="padding:0.4rem; font-size:0.75rem;">
          <strong>${p.jenis}</strong> (${p.warna || '-'})
        </div>
      </div>
    `
    )
    .join("");

  const waUrl = `https://wa.me/62${(cus.noHp || "").replace(/^0/, "")}`;

  showModal(
    `Profil Pelanggan: ${cus.nama}`,
    `
    <div style="display:flex; justify-content:space-between; align-items:center; background:#f0f9ff; padding:1rem; border-radius:12px; margin-bottom:1.25rem; border:1px solid #bae6fd;">
      <div>
        <h4 style="font-size:1.15rem; font-weight:800; color:#0369a1;">${cus.nama}</h4>
        <div style="font-size:0.85rem; color:#0c4a6e;">Nomor WhatsApp: <strong>${cus.noHp}</strong></div>
        <div style="font-size:0.8rem; color:#64748b; margin-top:0.2rem;">Alamat: ${cus.alamat || '-'}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.75rem; text-transform:uppercase; color:#0369a1; font-weight:700;">Total Belanja:</div>
        <div style="font-size:1.25rem; font-weight:800; color:#0284c7;">${formatRupiah(cus.totalBelanja || 0)}</div>
      </div>
    </div>

    <div style="margin-bottom:1.25rem;">
      <h5 style="font-size:0.95rem; font-weight:800; margin-bottom:0.5rem; color:#0f172a;">
        Riwayat Transaksi (${historyTrx.length}):
      </h5>
      <div style="max-height:160px; overflow-y:auto;">
        ${trxRows || '<p style="color:#94a3b8; font-size:0.85rem;">Belum ada riwayat transaksi.</p>'}
      </div>
    </div>

    <div>
      <h5 style="font-size:0.95rem; font-weight:800; margin-bottom:0.5rem; color:#0f172a;">
        Koleksi Pakaian Pelanggan (${historyPkn.length}):
      </h5>
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:0.5rem;">
        ${pknGrid || '<p style="color:#94a3b8; font-size:0.85rem; grid-column:1/-1;">Belum ada foto pakaian.</p>'}
      </div>
    </div>
    `,
    [
      {
        label: "Chat WhatsApp",
        className: "btn-success",
        onClick: () => window.open(waUrl, "_blank")
      },
      {
        label: "Tutup",
        className: "btn-outline",
        onClick: (close) => close()
      }
    ]
  );
}
