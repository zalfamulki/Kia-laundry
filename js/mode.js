/**
 * KIA LAUNDRY — Network Mode Manager (Online / Offline)
 * Mengatur preferensi mode ('auto', 'offline', 'online') dan mendeteksi ketersediaan jaringan.
 */

class ModeManager {
  static getPreference() {
    return localStorage.getItem("kia_mode_pref") || "auto";
  }

  static setPreference(mode) {
    localStorage.setItem("kia_mode_pref", mode);
    updateModeBadge();
    this.applyModeRestrictions();
  }

  static isEffectivelyOffline() {
    const pref = this.getPreference();
    if (pref === "offline") return true;
    if (pref === "online") return false;
    return !navigator.onLine;
  }

  static applyModeRestrictions() {
    const isOffline = this.isEffectivelyOffline();
    const navMenu = document.getElementById("navMenu");
    if (!navMenu) return;

    // Sesuai rancangan K4 & bagian 8:
    // Jika offline: navigasi menyusut ke 3 menu inti (Transaksi, Galeri, Export/Laporan)
    // dengan link cadangan ke semua menu
    const offlineCoreKeys = ["dashboard", "transaksi", "galeri", "laporan"];
    const links = navMenu.querySelectorAll("li");

    links.forEach(li => {
      const a = li.querySelector("a");
      if (!a) return;
      const href = a.getAttribute("href");
      const isCore = offlineCoreKeys.some(key => href.includes(key));
      
      if (isOffline && !isCore) {
        li.style.display = "none";
      } else {
        li.style.display = "";
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ModeManager.applyModeRestrictions();
  window.addEventListener("online", () => ModeManager.applyModeRestrictions());
  window.addEventListener("offline", () => ModeManager.applyModeRestrictions());
});
