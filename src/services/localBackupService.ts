import { db } from '../db';
import ExcelJS from 'exceljs';

/**
 * Membuat backup raw JSON dari seluruh data IndexedDB.
 */
export async function createRawBackup() {
  const backupData: Record<string, any[]> = {};
  
  await db.transaction('r', db.tables, async () => {
    for (const table of db.tables) {
      backupData[table.name] = await table.toArray();
    }
  });

  const jsonString = JSON.stringify(backupData);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `paud_backup_raw_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  await recordBackupDate();
}

async function recordBackupDate() {
  const now = new Date().toISOString();
  const existing = await db.pengaturan.where('kunci').equals('last_local_backup_date').first();
  if (existing) {
    existing.nilai = { date: now };
    existing.updated_at = now;
    await db.pengaturan.put(existing);
  } else {
    await db.pengaturan.add({ id: crypto.randomUUID(), kunci: 'last_local_backup_date', nilai: { date: now }, created_at: now, updated_at: now, keterangan: 'Tanggal Backup Terakhir', _sync_status: 'pending', _sync_at: null, _local_only: true });
  }
}

/**
 * Me-restore backup raw JSON ke IndexedDB.
 */
export async function restoreRawBackup(file: File) {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const backupData = JSON.parse(text) as Record<string, any[]>;
        
        await db.transaction('rw', db.tables, async () => {
          for (const table of db.tables) {
            if (backupData[table.name]) {
              await table.clear();
              await table.bulkAdd(backupData[table.name]);
            }
          }
        });
        resolve();
      } catch (err) {
        reject(new Error('Gagal memproses file backup: ' + (err as Error).message));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsText(file);
  });
}

/**
 * Membuat backup human readable dalam format Excel (.xlsx).
 */
export async function createHumanReadableBackup() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PAUD Billing App';
  workbook.created = new Date();

  await db.transaction('r', db.tables, async () => {
    for (const table of db.tables) {
      const records = await table.toArray();
      if (records.length === 0) continue;
      
      let sheetName = table.name;
      // Excel sheet name limit is 31 characters
      if (sheetName.length > 31) sheetName = sheetName.slice(0, 31);
      
      const sheet = workbook.addWorksheet(sheetName);
      
      // Collect all possible keys
      const keySet = new Set<string>();
      records.forEach(r => Object.keys(r).forEach(k => keySet.add(k)));
      const keys = Array.from(keySet);
      
      sheet.columns = keys.map(k => ({ header: k, key: k }));
      
      records.forEach(record => {
        const rowData: any = {};
        keys.forEach(k => {
          if (typeof record[k] === 'object' && record[k] !== null) {
            rowData[k] = JSON.stringify(record[k]);
          } else {
            rowData[k] = record[k];
          }
        });
        sheet.addRow(rowData);
      });
      
      // Auto-fit columns
      sheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell!({ includeEmpty: true }, cell => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) maxLength = columnLength;
        });
        column.width = maxLength < 10 ? 10 : maxLength + 2;
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `paud_backup_readable_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  await recordBackupDate();
}
