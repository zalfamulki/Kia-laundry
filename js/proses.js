/**
 * KIA LAUNDRY — Monitoring Proses Status & Checklist Pakaian
 * Mengelompokkan transaksi ke dalam tahapan: Masuk -> Dicuci -> Disetrika -> Siap -> Diambil.
 * Memastikan verifikasi checklist fisik sebelum cucian diserahkan ke pelanggan.
 */

const STAGES = [
  { key: "masuk", title: "1. Masuk", next: "dicuci", nextLabel: "Cuci Sekarang" },
  { key: "dicuci", title: "2. Dicuci", next: "disetrika", nextLabel: "Setrika Sekarang" },
  { key: "disetrika", title: "3. Disetrika", next: "siap", nextLabel: "Tandai Siap" },
  { key: "siap", title: "4. Siap Diambil", next: "diambil", nextLabel: "Serahkan Cucian" },
  { key: "diambil", title: "5. Selesai Diambil", next: null, nextLabel: "" }
];

let allTrx = [];
let allPkn = [];

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("proses");
  renderFooter();

  try {
    await initDB();
    await loadProsesBoard();
  } catch (err) {
    console.error("Gagal memuat papan proses:", err);
    showToast("Gagal memuat data proses.", "error");
  }
});

async function loadProsesBoard() {
  allTrx = await db.transaksi.toArray();
  allPkn = await db.pakaian.toArray();

  for (const stage of STAGES) {
    const stageTrx = allTrx.filter((t) => (t.status || "masuk") === stage.key);
    
    // Update counter di header kolom
    const badge = document.getElementById(`count_${stage.key}`);
    if (badge) badge.textContent = stageTrx.length;

    // Render cards
    const container = document.getElementById(`col_${stage.key}`);
    if (!container) continue;

    if (stageTrx.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:1.5rem 0.5rem; color:#94a3b8; font-size:0.85rem;">
          Tidak ada cucian di tahap ini
        </div>
      `;
      continue;
    }

    container.innerHTML = stageTrx
      .map((t) => {
        const items = allPkn.filter((p) => p.transaksiId === t.id);
        const thumbsHtml = items
          .slice(0, 4)
          .map(
            (p) =>
              `<img src="${p.fotoThumb || p.foto || '../assets/icon.svg'}" class="kanban-item-thumb" title="${p.jenis} (${p.warna})">`
          )
          .join("");

        const nextActionBtn = stage.next
          ? `<button class="btn btn-sm ${stage.key === 'siap' ? 'btn-success' : 'btn-yellow'}" onclick="handleStageTransition('${t.id}', '${stage.next}')">
              <span>${stage.nextLabel}</span>
            </button>`
          : `<span style="font-size:0.75rem; color:#10b981; font-weight:700; display:inline-flex; align-items:center; gap:3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Selesai</span>`;

        return `
          <div class="kanban-card">
            <div class="kanban-card-header">
              <div>
                <div class="kanban-customer">${t.namaCustomer}</div>
                <div style="font-size:0.78rem; color:#64748b;">${t.id} • ${t.layanan.toUpperCase()}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.85rem; font-weight:800; color:#0f172a;">${formatRupiah(t.totalHarga)}</div>
                <div style="font-size:0.75rem;">${getBayarBadge(t.statusBayar)}</div>
              </div>
            </div>

            <div class="kanban-items-preview">
              ${thumbsHtml}
              ${items.length > 4 ? `<span style="font-size:0.75rem; color:#64748b; align-self:center;">+${items.length - 4}</span>` : ''}
            </div>

            <div style="font-size:0.78rem; color:#64748b; margin-top:0.35rem;">
              Target: <strong>${formatTanggal(t.estimasiSelesai, true)}</strong>
            </div>

            <div class="kanban-card-actions">
              <span style="font-size:0.72rem; color:#94a3b8;">
                Update: ${formatTanggal(t.updatedAt || t.createdAt, true)}
              </span>
              ${nextActionBtn}
            </div>
          </div>
        `;
      })
      .join("");
  }
}

// Handler Perpindahan Status
async function handleStageTransition(trxId, nextStatus) {
  const trx = allTrx.find((t) => t.id === trxId);
  if (!trx) return;

  // Jika transisi ke "diambil", wajibkan checklist verifikasi fisik pakaian
  if (nextStatus === "diambil") {
    openChecklistModal(trx);
    return;
  }

  // Konfirmasi langsung untuk tahap sebelumnya
  await db.transaksi.update(trxId, {
    status: nextStatus,
    updatedAt: new Date().toISOString()
  });

  showToast(`Cucian ${trxId} dipindahkan ke status: ${nextStatus.toUpperCase()}`, "success");
  await loadProsesBoard();
}

// Modal Verifikasi Checklist Fisik Pakaian Sebelum Diserahkan
function openChecklistModal(trx) {
  const items = allPkn.filter((p) => p.transaksiId === trx.id);

  if (items.length === 0) {
    if (confirm(`Serahkan cucian ${trx.id} kepada ${trx.namaCustomer}?`)) {
      finalizeSerahkanCucian(trx.id);
    }
    return;
  }

  const itemsHtml = items
    .map(
      (p, idx) => `
      <label class="checklist-item" id="checkLabel_${idx}">
        <input type="checkbox" class="checklist-checkbox pkn-check" data-index="${idx}">
        <img src="${p.fotoThumb || p.foto || '../assets/icon.svg'}" style="width:44px; height:44px; object-fit:cover; border-radius:6px;">
        <div style="flex:1;">
          <div style="font-weight:800; font-size:0.9rem;">${p.jumlah}x ${p.jenis} (${p.warna || '-'})</div>
          <div style="font-size:0.78rem; color:#64748b;">${p.kondisi ? `Kondisi: ${p.kondisi}` : 'Kondisi baik'} ${p.merek ? `• Merek: ${p.merek}` : ''}</div>
        </div>
      </label>
    `
    )
    .join("");

  showModal(
    `Checklist Pakaian — ${trx.id}`,
    `
    <div style="margin-bottom:1rem;">
      <p style="font-size:0.9rem; color:#475569;">
        Centang setiap potong pakaian bersama pelanggan <strong>${trx.namaCustomer}</strong> untuk memastikan tidak ada pakaian yang tertinggal atau tertukar:
      </p>
    </div>
    <div style="max-height:50vh; overflow-y:auto; margin-bottom:1rem;">
      ${itemsHtml}
    </div>
    <div style="background:#f1f5f9; padding:0.85rem; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
      <span style="font-weight:700; font-size:0.875rem;">Status Bayar:</span>
      <select id="checklistStatusBayar" class="form-select" style="width:auto; padding:0.35rem 0.75rem; font-size:0.85rem;">
        <option value="lunas" ${trx.statusBayar === 'lunas' ? 'selected' : ''}>Lunas Sekarang</option>
        <option value="dp" ${trx.statusBayar === 'dp' ? 'selected' : ''}>DP (Ada Sisa)</option>
        <option value="belum" ${trx.statusBayar === 'belum' ? 'selected' : ''}>Belum Bayar</option>
      </select>
    </div>
    `,
    [
      {
        label: "Konfirmasi & Serahkan Cucian",
        className: "btn-success",
        onClick: async (close) => {
          const checkboxes = document.querySelectorAll(".pkn-check");
          const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

          if (!allChecked) {
            if (!confirm("Beberapa pakaian belum dicentang. Apakah Anda yakin semua fisik pakaian sudah sesuai?")) {
              return;
            }
          }

          const bayarSelect = document.getElementById("checklistStatusBayar");
          const finalStatusBayar = bayarSelect ? bayarSelect.value : trx.statusBayar;

          await finalizeSerahkanCucian(trx.id, finalStatusBayar);
          close();
        }
      },
      {
        label: "Batal",
        className: "btn-outline",
        onClick: (close) => close()
      }
    ]
  );

  // Setup live checkbox style change
  document.querySelectorAll(".pkn-check").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const idx = e.target.getAttribute("data-index");
      const label = document.getElementById(`checkLabel_${idx}`);
      if (label) {
        if (e.target.checked) label.classList.add("checked");
        else label.classList.remove("checked");
      }
    });
  });
}

// Finalisasi Penyerahan Cucian
async function finalizeSerahkanCucian(trxId, statusBayar = "lunas") {
  await db.transaksi.update(trxId, {
    status: "diambil",
    statusBayar: statusBayar,
    updatedAt: new Date().toISOString()
  });

  showToast(`Cucian ${trxId} resmi diserahkan kepada pelanggan!`, "success");
  await loadProsesBoard();
}
