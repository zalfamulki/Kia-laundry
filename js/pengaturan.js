/**
 * KIA LAUNDRY — Pengaturan Logic
 * Mengelola profil toko untuk nota, daftar harga kiloan & satuan,
 * preferensi online/offline, dan opsi reset database.
 */

let appSettings = null;

document.addEventListener("DOMContentLoaded", async () => {
  renderNav("pengaturan");
  renderFooter();

  try {
    await initDB();
    await loadSettingsForm();
    setupSettingsEvents();
  } catch (err) {
    console.error("Gagal inisialisasi pengaturan:", err);
    showToast("Gagal memuat pengaturan toko.", "error");
  }
});

async function loadSettingsForm() {
  appSettings = (await db.pengaturan.get("app")) || {};

  // 1. Profil Toko
  document.getElementById("cfgNamaLaundry").value = appSettings.namaLaundry || "KIA Laundry";
  document.getElementById("cfgSlogan").value = appSettings.slogan || "Clean & Fresh — Semua Bisa, Layanan Antar Jemput";
  document.getElementById("cfgAlamat").value = appSettings.alamat || "";
  document.getElementById("cfgHp1").value = appSettings.noHp1 || "085179591769";
  document.getElementById("cfgHp2").value = appSettings.noHp2 || "08112291769";

  // Task 4 — kasir, syarat nota, & template WhatsApp
  const cfgKasir = document.getElementById("cfgKasir");
  if (cfgKasir) cfgKasir.value = appSettings.kasir || "Kasir KIA Laundry";

  const cfgSyarat = document.getElementById("cfgSyarat");
  if (cfgSyarat) cfgSyarat.value = appSettings.syarat || DEFAULT_SYARAT;

  const cfgWaMasuk = document.getElementById("cfgWaTemplateMasuk");
  if (cfgWaMasuk) cfgWaMasuk.value = appSettings.waTemplateMasuk || DEFAULT_WA_TEMPLATES.masuk;

  const cfgWaSiap = document.getElementById("cfgWaTemplateSiap");
  if (cfgWaSiap) cfgWaSiap.value = appSettings.waTemplateSiap || DEFAULT_WA_TEMPLATES.siap;

  renderWaPlaceholderList();

  // 2. Batas Purge Foto Otomatis (Task 2.2)
  const cfgPurge = document.getElementById("cfgBatasPurgeHari");
  if (cfgPurge) cfgPurge.value = appSettings.batasPurgeHari ?? 90;

  // 3. Harga Kiloan
  const h = appSettings.harga || {};
  document.getElementById("cfgHargaCuciSetrika").value = h.cuciSetrika || 9000;
  document.getElementById("cfgHargaCuci").value = h.cuci || 6000;
  document.getElementById("cfgHargaSetrika").value = h.setrika || 5000;

  // 4. Harga Satuan
  const s = h.satuan || {};
  document.getElementById("cfgSatKemeja").value = s.kemeja || 7000;
  document.getElementById("cfgSatKaos").value = s.kaos || 5000;
  document.getElementById("cfgSatCelana").value = s.celana || 7000;
  document.getElementById("cfgSatJeans").value = s.jeans || 9000;
  document.getElementById("cfgSatJaket").value = s.jaket || 12000;
  document.getElementById("cfgSatSelimut").value = s.selimut || 15000;
  document.getElementById("cfgSatBedcover").value = s.bedcover || 25000;
  document.getElementById("cfgSatJas").value = s.jas || 20000;
  document.getElementById("cfgSatSepatu").value = s.sepatu || 25000;

  // 4. Mode Preference
  const currentMode = localStorage.getItem("kia_mode_pref") || "auto";
  const radio = document.querySelector(`input[name="cfgModePref"][value="${currentMode}"]`);
  if (radio) radio.checked = true;
}

function setupSettingsEvents() {
  // Simpan Form Pengaturan
  const form = document.getElementById("formPengaturanToko");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const updated = {
        ...appSettings,
        id: "app",
        namaLaundry: document.getElementById("cfgNamaLaundry").value.trim(),
        slogan: document.getElementById("cfgSlogan").value.trim(),
        alamat: document.getElementById("cfgAlamat").value.trim(),
        noHp1: document.getElementById("cfgHp1").value.trim(),
        noHp2: document.getElementById("cfgHp2").value.trim(),
        kasir: document.getElementById("cfgKasir")?.value.trim() || "Kasir KIA Laundry",
        syarat: document.getElementById("cfgSyarat")?.value.trim() || DEFAULT_SYARAT,
        waTemplateMasuk:
          document.getElementById("cfgWaTemplateMasuk")?.value || DEFAULT_WA_TEMPLATES.masuk,
        waTemplateSiap:
          document.getElementById("cfgWaTemplateSiap")?.value || DEFAULT_WA_TEMPLATES.siap,
        logo: appSettings.logo || "./assets/logo.png",
        batasPurgeHari: Number(document.getElementById("cfgBatasPurgeHari")?.value) || 90,
        harga: {
          cuciSetrika: Number(document.getElementById("cfgHargaCuciSetrika").value) || 9000,
          cuci: Number(document.getElementById("cfgHargaCuci").value) || 6000,
          setrika: Number(document.getElementById("cfgHargaSetrika").value) || 5000,
          satuan: {
            kemeja: Number(document.getElementById("cfgSatKemeja").value) || 7000,
            kaos: Number(document.getElementById("cfgSatKaos").value) || 5000,
            celana: Number(document.getElementById("cfgSatCelana").value) || 7000,
            jeans: Number(document.getElementById("cfgSatJeans").value) || 9000,
            jaket: Number(document.getElementById("cfgSatJaket").value) || 12000,
            selimut: Number(document.getElementById("cfgSatSelimut").value) || 15000,
            bedcover: Number(document.getElementById("cfgSatBedcover").value) || 25000,
            jas: Number(document.getElementById("cfgSatJas").value) || 20000,
            sepatu: Number(document.getElementById("cfgSatSepatu").value) || 25000
          }
        }
      };

      await db.pengaturan.put(updated);

      // Simpan Mode
      const selectedMode = document.querySelector('input[name="cfgModePref"]:checked')?.value || "auto";
      ModeManager.setPreference(selectedMode);

      showToast("Pengaturan identitas dan daftar harga berhasil disimpan!", "success");
      appSettings = updated;
    });
  }

  setupWaTemplateEditor();

  // Tombol Hapus Semua Data
  const btnResetData = document.getElementById("btnResetData");
  if (btnResetData) {
    btnResetData.addEventListener("click", async () => {
      const confirmWord = prompt("Ketik kata 'HAPUS' (huruf besar) untuk menghapus seluruh data transaksi dan foto pakaian di browser ini:");
      if (confirmWord === "HAPUS") {
        await db.transaksi.clear();
        await db.pakaian.clear();
        await db.customer.clear();
        showToast("Seluruh data berhasil dibersihkan.", "info");
        setTimeout(() => window.location.reload(), 1200);
      } else if (confirmWord !== null) {
        showToast("Konfirmasi dibatalkan. Kata yang Anda ketik tidak cocok.", "warning");
      }
    });
  }
}

// ============================================================
// Task 4 — Editor template WhatsApp (2 tahap)
// ============================================================

function renderWaPlaceholderList() {
  const host = document.getElementById("waPlaceholderList");
  if (!host || typeof WA_PLACEHOLDERS === "undefined") return;

  host.innerHTML = WA_PLACEHOLDERS.map(
    (p) =>
      `<span class="wa-placeholder-chip"><code>{${escapeHtml(p.key)}}</code>${escapeHtml(p.label)}</span>`
  ).join("");
}

function getWaFormSettings() {
  return {
    namaLaundry: document.getElementById("cfgNamaLaundry")?.value.trim() || "KIA Laundry",
    slogan: document.getElementById("cfgSlogan")?.value.trim() || "Clean & Fresh",
    alamat: document.getElementById("cfgAlamat")?.value.trim() || "",
    noHp1: document.getElementById("cfgHp1")?.value.trim() || "",
    noHp2: document.getElementById("cfgHp2")?.value.trim() || "",
    kasir: document.getElementById("cfgKasir")?.value.trim() || "Kasir KIA Laundry",
    syarat: document.getElementById("cfgSyarat")?.value.trim() || DEFAULT_SYARAT,
    waTemplateMasuk: document.getElementById("cfgWaTemplateMasuk")?.value || "",
    waTemplateSiap: document.getElementById("cfgWaTemplateSiap")?.value || ""
  };
}

function showWaPreview(stage) {
  const box = document.getElementById("waPreviewBox");
  const title = document.getElementById("waPreviewTitle");
  const text = document.getElementById("waPreviewText");
  if (!box || !title || !text) return;

  const settings = getWaFormSettings();
  const template = stage === "masuk" ? settings.waTemplateMasuk : settings.waTemplateSiap;

  if (!template.trim()) {
    showToast("Template masih kosong. Isi pesan atau reset ke default.", "warning");
    return;
  }

  const data = getWaPreviewData(settings);
  title.textContent =
    stage === "masuk" ? "Pratinjau Tahap 1 — Cucian Masuk" : "Pratinjau Tahap 2 — Cucian Siap";
  text.textContent = renderWaTemplate(template, data).trim();
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setupWaTemplateEditor() {
  const cfgMasuk = document.getElementById("cfgWaTemplateMasuk");
  const cfgSiap = document.getElementById("cfgWaTemplateSiap");

  const btnPreviewMasuk = document.getElementById("btnPreviewWaMasuk");
  const btnPreviewSiap = document.getElementById("btnPreviewWaSiap");
  const btnResetMasuk = document.getElementById("btnResetWaMasuk");
  const btnResetSiap = document.getElementById("btnResetWaSiap");
  const btnClose = document.getElementById("btnCloseWaPreview");

  if (btnPreviewMasuk) btnPreviewMasuk.addEventListener("click", () => showWaPreview("masuk"));
  if (btnPreviewSiap) btnPreviewSiap.addEventListener("click", () => showWaPreview("siap"));

  if (btnResetMasuk && cfgMasuk) {
    btnResetMasuk.addEventListener("click", () => {
      if (!confirm("Kembalikan template Tahap 1 ke teks default?")) return;
      cfgMasuk.value = DEFAULT_WA_TEMPLATES.masuk;
      showToast("Template Tahap 1 dikembalikan ke default. Klik Simpan untuk menerapkan.", "info");
    });
  }

  if (btnResetSiap && cfgSiap) {
    btnResetSiap.addEventListener("click", () => {
      if (!confirm("Kembalikan template Tahap 2 ke teks default?")) return;
      cfgSiap.value = DEFAULT_WA_TEMPLATES.siap;
      showToast("Template Tahap 2 dikembalikan ke default. Klik Simpan untuk menerapkan.", "info");
    });
  }

  if (btnClose) {
    btnClose.addEventListener("click", () => {
      const box = document.getElementById("waPreviewBox");
      if (box) box.hidden = true;
    });
  }
}
