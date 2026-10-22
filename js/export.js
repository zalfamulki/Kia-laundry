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
}
