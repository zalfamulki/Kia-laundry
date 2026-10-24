/**
 * KIA LAUNDRY — Modul Export Excel (Opsi A & Opsi B)
 * Opsi A: SheetJS (XLSX) + JSZip (Folder foto dan spreadsheet ringan terpisah)
 * Opsi B: ExcelJS (Spreadsheet dengan foto tertanam di dalam sel)
 */

class ExportManager {
  // Helper download blob file di browser
  static triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // Opsi A: XLSX + ZIP Foto (Default & Ringan)
  static async exportZipXlsx(transaksiList, pakaianList, filenamePrefix = "KIA_Laundry") {
    if (typeof XLSX === "undefined" || typeof JSZip === "undefined") {
      throw new Error("Library XLSX atau JSZip belum termuat.");
    }

    const zip = new JSZip();
    const folderFoto = zip.folder("foto");

    // 1. Data Sheet Transaksi
    const dataTrx = transaksiList.map((t, idx) => {
      const jmlPakaian = pakaianList
        .filter((p) => p.transaksiId === t.id)
        .reduce((sum, p) => sum + (Number(p.jumlah) || 1), 0);

      return {
        No: idx + 1,
        "No Transaksi": t.id,
        "Tanggal Masuk": t.tanggalMasuk,
        "Nama Customer": t.namaCustomer,
        "No WhatsApp": t.noHp,
        Alamat: t.alamat || "-",
        Layanan: t.layanan,
        "Estimasi Selesai": t.estimasiSelesai,
        Status: t.status,
        "Status Bayar": t.statusBayar,
        "Total Harga (Rp)": t.totalHarga,
        "Jumlah Pakaian": jmlPakaian,
        Catatan: t.catatan || "-"
      };
    });

    // 2. Data Sheet Pakaian & Ekstraksi File Foto ke ZIP
    const dataPkn = [];
    let pknIdx = 1;

    for (const p of pakaianList) {
      const parentTrx = transaksiList.find((t) => t.id === p.transaksiId) || {};
      let namaFileFoto = "-";

      if (p.foto && p.foto.startsWith("data:image/")) {
        namaFileFoto = `${p.transaksiId}_${p.id}.jpg`;
        // Ambil base64 data tanpa header
        const base64Data = p.foto.split(",")[1];
        if (base64Data) {
          folderFoto.file(namaFileFoto, base64Data, { base64: true });
        }
      }

      dataPkn.push({
        No: pknIdx++,
        "No Transaksi": p.transaksiId,
        "Nama Customer": parentTrx.namaCustomer || "-",
        "No WhatsApp": parentTrx.noHp || "-",
        "Jenis Pakaian": p.jenis,
        Warna: p.warna || "-",
        Merek: p.merek || "-",
        "Kondisi Awal": p.kondisi || "Baik",
        Jumlah: p.jumlah || 1,
        "File Foto": namaFileFoto,
        "Waktu Input": p.createdAt
      });
    }

    // Bangun workbook XLSX
    const wb = XLSX.utils.book_new();
    const wsTrx = XLSX.utils.json_to_sheet(dataTrx);
    const wsPkn = XLSX.utils.json_to_sheet(dataPkn);

    XLSX.utils.book_append_sheet(wb, wsTrx, "Transaksi");
    XLSX.utils.book_append_sheet(wb, wsPkn, "Pakaian");

    const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    zip.file("data_laundry.xlsx", xlsxBuffer);

    // Generate zip blob
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const today = new Date().toISOString().slice(0, 10);
    this.triggerDownload(zipBlob, `${filenamePrefix}_${today}.zip`);
  }

  // Opsi B: XLSX dengan Foto Tertanam (ExcelJS)
  static async exportEmbeddedPhotosXlsx(transaksiList, pakaianList, filenamePrefix = "KIA_Laundry_Foto") {
    if (typeof ExcelJS === "undefined") {
      throw new Error("Library ExcelJS belum termuat.");
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "KIA Laundry";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Pakaian & Foto");

    sheet.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "No Transaksi", key: "trxId", width: 20 },
      { header: "Nama Customer", key: "customer", width: 22 },
      { header: "No WhatsApp", key: "hp", width: 16 },
      { header: "Jenis Pakaian", key: "jenis", width: 22 },
      { header: "Warna", key: "warna", width: 14 },
      { header: "Kondisi Awal", key: "kondisi", width: 25 },
      { header: "Jumlah", key: "jumlah", width: 8 },
      { header: "Status", key: "status", width: 14 },
      { header: "Total (Rp)", key: "total", width: 14 },
      { header: "Foto Pakaian", key: "foto", width: 20 }
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0284C7" } // Brand blue
    };

    let rowIndex = 2;
    for (let i = 0; i < pakaianList.length; i++) {
      const p = pakaianList[i];
      const t = transaksiList.find((trx) => trx.id === p.transaksiId) || {};

      const row = sheet.addRow({
        no: i + 1,
        trxId: p.transaksiId,
        customer: t.namaCustomer || "-",
        hp: t.noHp || "-",
        jenis: p.jenis,
        warna: p.warna || "-",
        kondisi: p.kondisi || "Baik",
        jumlah: p.jumlah || 1,
        status: (t.status || "").toUpperCase(),
        total: t.totalHarga || 0,
        foto: ""
      });

      row.height = 70; // Berikan ruang untuk thumbnail foto
      row.alignment = { vertical: "middle", horizontal: "left" };

      // Sematkan gambar bila base64 jpeg/png
      if (p.foto && p.foto.startsWith("data:image/")) {
        try {
          const base64Data = p.foto.split(",")[1];
          const isJpeg = p.foto.includes("image/jpeg");
          const imageId = workbook.addImage({
            base64: base64Data,
            extension: isJpeg ? "jpeg" : "png"
          });

          sheet.addImage(imageId, {
            tl: { col: 10, row: rowIndex - 1 },
            ext: { width: 85, height: 60 }
          });
        } catch (imgErr) {
          console.warn("Gagal menyematkan foto baris " + rowIndex, imgErr);
        }
      }

      rowIndex++;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const today = new Date().toISOString().slice(0, 10);
    this.triggerDownload(blob, `${filenamePrefix}_${today}.xlsx`);
  }

  // =====================================================
  // Task 4 — Export Laporan Keuangan (Excel, kapan saja)
  // Berisi ringkasan, rekap pembayaran, layanan, harian, detail.
  // =====================================================
  static _formatRupiahCell(ws, cols) {
    if (!ws || !ws["!ref"]) return;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (const c of cols) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && typeof cell.v === "number") cell.z = "#,##0";
      }
    }
  }

  static async exportLaporanKeuangan(transaksiList, pakaianList, meta = {}) {
    if (typeof XLSX === "undefined") {
      throw new Error("Library XLSX belum termuat.");
    }

    const paidOf = (t) =>
      typeof getJumlahDibayar === "function"
        ? getJumlahDibayar(t)
        : t.statusBayar === "lunas"
          ? Number(t.totalHarga) || 0
          : Number(t.jumlahDibayar) || 0;
    const sisaOf = (t) => Math.max(0, (Number(t.totalHarga) || 0) - paidOf(t));
    const statusBayarLabel = (s) =>
      ({ lunas: "Lunas", dp: "DP", belum: "Belum Bayar" })[s] || "Belum Bayar";
    const layananLabel = (l) =>
      typeof formatLayananLabel === "function" ? formatLayananLabel(l) : l || "-";

    const pcsByTrx = new Map();
    for (const p of pakaianList) {
      pcsByTrx.set(p.transaksiId, (pcsByTrx.get(p.transaksiId) || 0) + (Number(p.jumlah) || 1));
    }
    const pcsOf = (t) => pcsByTrx.get(t.id) || 0;

    const sorted = transaksiList
      .slice()
      .sort((a, b) => String(a.tanggalMasuk || "").localeCompare(String(b.tanggalMasuk || "")));

    const totalOmzet = sorted.reduce((s, t) => s + (Number(t.totalHarga) || 0), 0);
    const totalDibayar = sorted.reduce((s, t) => s + paidOf(t), 0);
    const totalSisa = sorted.reduce((s, t) => s + sisaOf(t), 0);
    const totalPcs = sorted.reduce((s, t) => s + pcsOf(t), 0);

    const wb = XLSX.utils.book_new();

    // 1. RINGKASAN
    const statusBayarKeys = ["lunas", "dp", "belum"];
    const statusCuciKeys = ["masuk", "dicuci", "disetrika", "siap", "diambil"];
    const statusCuciLabels = {
      masuk: "Masuk",
      dicuci: "Dicuci",
      disetrika: "Disetrika",
      siap: "Siap Antar/Ambil",
      diambil: "Sudah Diambil"
    };

    const ringkasanRows = [
      ["LAPORAN KEUANGAN — KIA LAUNDRY"],
      ["Periode", meta.periodeText || "Semua data"],
      ["Filter status cucian", meta.filterStatus || "Semua status"],
      ["Filter status pembayaran", meta.filterBayar || "Semua status"],
      ["Filter layanan", meta.filterLayanan || "Semua layanan"],
      ["Dibuat", new Date().toLocaleString("id-ID")],
      [],
      ["RINGKASAN"],
      ["Jumlah transaksi", sorted.length],
      ["Jumlah pakaian (pcs)", totalPcs],
      ["Total omzet (Rp)", totalOmzet],
      ["Total sudah dibayar (Rp)", totalDibayar],
      ["Total sisa tagihan (Rp)", totalSisa],
      [],
      ["REKAP STATUS PEMBAYARAN"],
      ["Status", "Transaksi", "Nominal (Rp)"]
    ];
    for (const key of statusBayarKeys) {
      const list = sorted.filter((t) => (t.statusBayar || "belum") === key);
      const nominal = list.reduce((s, t) => s + paidOf(t), 0);
      ringkasanRows.push([statusBayarLabel(key), list.length, nominal]);
    }
    ringkasanRows.push([], ["REKAP STATUS CUCIAN"], ["Status", "Transaksi"]);
    for (const key of statusCuciKeys) {
      ringkasanRows.push([
        statusCuciLabels[key],
        sorted.filter((t) => (t.status || "masuk") === key).length
      ]);
    }

    const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasanRows);
    wsRingkasan["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }];
    wsRingkasan.A1 = { t: "s", v: "LAPORAN KEUANGAN — KIA LAUNDRY", s: { font: { bold: true } } };
    ExportManager._formatRupiahCell(wsRingkasan, [1, 2]);
    XLSX.utils.book_append_sheet(wb, wsRingkasan, "Ringkasan");

    // 2. REKAP PEMBAYARAN (per transaksi)
    const pembayaranRows = [
      [
        "No",
        "No. Nota",
        "Tanggal Masuk",
        "Customer",
        "No. WhatsApp",
        "Layanan",
        "Berat (Kg)",
        "Pcs",
        "Total (Rp)",
        "Dibayar (Rp)",
        "Sisa (Rp)",
        "Status Bayar",
        "Status Cucian"
      ]
    ];
    sorted.forEach((t, i) => {
      pembayaranRows.push([
        i + 1,
        t.id,
        String(t.tanggalMasuk || "").replace("T", " ").slice(0, 16),
        t.namaCustomer || "-",
        t.noHp || "-",
        layananLabel(t.layanan),
        Number(t.berat) || 0,
        pcsOf(t),
        Number(t.totalHarga) || 0,
        paidOf(t),
        sisaOf(t),
        statusBayarLabel(t.statusBayar),
        statusCuciLabels[t.status] || "Masuk"
      ]);
    });
    pembayaranRows.push([
      "",
      "",
      "",
      "TOTAL",
      "",
      "",
      "",
      totalPcs,
      totalOmzet,
      totalDibayar,
      totalSisa,
      "",
      ""
    ]);

    const wsPembayaran = XLSX.utils.aoa_to_sheet(pembayaranRows);
    wsPembayaran["!cols"] = [
      { wch: 5 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 15 },
      { wch: 16 },
      { wch: 10 },
      { wch: 7 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 13 },
      { wch: 16 }
    ];
    ExportManager._formatRupiahCell(wsPembayaran, [8, 9, 10]);
    XLSX.utils.book_append_sheet(wb, wsPembayaran, "Rekap Pembayaran");

    // 3. REKAP LAYANAN
    const layananMap = new Map();
    for (const t of sorted) {
      const key = layananLabel(t.layanan);
      if (!layananMap.has(key)) {
        layananMap.set(key, { trx: 0, pcs: 0, omzet: 0, dibayar: 0, sisa: 0 });
      }
      const row = layananMap.get(key);
      row.trx += 1;
      row.pcs += pcsOf(t);
      row.omzet += Number(t.totalHarga) || 0;
      row.dibayar += paidOf(t);
      row.sisa += sisaOf(t);
    }
    const layananRows = [["Layanan", "Transaksi", "Pcs", "Omzet (Rp)", "Dibayar (Rp)", "Sisa (Rp)"]];
    Array.from(layananMap.entries())
      .sort((a, b) => b[1].omzet - a[1].omzet)
      .forEach(([label, v]) => {
        layananRows.push([label, v.trx, v.pcs, v.omzet, v.dibayar, v.sisa]);
      });
    layananRows.push(["TOTAL", sorted.length, totalPcs, totalOmzet, totalDibayar, totalSisa]);

    const wsLayanan = XLSX.utils.aoa_to_sheet(layananRows);
    wsLayanan["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    ExportManager._formatRupiahCell(wsLayanan, [3, 4, 5]);
    XLSX.utils.book_append_sheet(wb, wsLayanan, "Rekap Layanan");

    // 4. REKAP HARIAN
    const harianMap = new Map();
    for (const t of sorted) {
      const key = String(t.tanggalMasuk || "").slice(0, 10) || "-";
      if (!harianMap.has(key)) {
        harianMap.set(key, { trx: 0, pcs: 0, omzet: 0, dibayar: 0, sisa: 0 });
      }
      const row = harianMap.get(key);
      row.trx += 1;
      row.pcs += pcsOf(t);
      row.omzet += Number(t.totalHarga) || 0;
      row.dibayar += paidOf(t);
      row.sisa += sisaOf(t);
    }
    const harianRows = [["Tanggal", "Transaksi", "Pcs", "Omzet (Rp)", "Dibayar (Rp)", "Sisa (Rp)"]];
    Array.from(harianMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([tanggal, v]) => {
        harianRows.push([tanggal, v.trx, v.pcs, v.omzet, v.dibayar, v.sisa]);
      });
    harianRows.push(["TOTAL", sorted.length, totalPcs, totalOmzet, totalDibayar, totalSisa]);

    const wsHarian = XLSX.utils.aoa_to_sheet(harianRows);
    wsHarian["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    ExportManager._formatRupiahCell(wsHarian, [3, 4, 5]);
    XLSX.utils.book_append_sheet(wb, wsHarian, "Rekap Harian");

    // 5. DETAIL PAKAIAN
    const trxById = new Map(sorted.map((t) => [t.id, t]));
    const detailRows = [
      [
        "No",
        "No. Nota",
        "Tanggal Masuk",
        "Customer",
        "Jenis Pakaian",
        "Warna",
        "Merek",
        "Jumlah",
        "Kondisi Awal",
        "Layanan",
        "Status Cucian"
      ]
    ];
    const detailItems = pakaianList
      .filter((p) => trxById.has(p.transaksiId))
      .sort((a, b) =>
        String(trxById.get(a.transaksiId)?.tanggalMasuk || "").localeCompare(
          String(trxById.get(b.transaksiId)?.tanggalMasuk || "")
        )
      );
    detailItems.forEach((p, i) => {
      const t = trxById.get(p.transaksiId) || {};
      detailRows.push([
        i + 1,
        p.transaksiId,
        String(t.tanggalMasuk || "").replace("T", " ").slice(0, 16),
        t.namaCustomer || "-",
        p.jenis || "-",
        p.warna || "-",
        p.merek || "-",
        Number(p.jumlah) || 1,
        p.kondisi || "Baik",
        layananLabel(t.layanan),
        statusCuciLabels[t.status] || "Masuk"
      ]);
    });

    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsDetail["!cols"] = [
      { wch: 5 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
      { wch: 12 },
      { wch: 14 },
      { wch: 8 },
      { wch: 22 },
      { wch: 16 },
      { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detail Pakaian");

    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const start = meta.start || "awal";
    const end = meta.end || new Date().toISOString().slice(0, 10);
    ExportManager.triggerDownload(blob, `Laporan_Keuangan_KIA_${start}_${end}.xlsx`);

    try {
      localStorage.setItem("kia_laporan_last_export", new Date().toISOString());
    } catch (err) {
      console.warn("Gagal mencatat waktu export laporan:", err);
    }

    return { transaksi: sorted.length, pcs: totalPcs, omzet: totalOmzet, dibayar: totalDibayar, sisa: totalSisa };
  }
}
