import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { retrySyncItem, discardSyncItem } from '../../services/syncService';
import { RefreshCw, Trash2, X, AlertTriangle } from 'lucide-react';
import { useConfirmStore } from '../../store/confirmStore';
import { useToastStore } from '../../store/toastStore';

interface SyncQueueManagerProps {
  onClose: () => void;
}

export default function SyncQueueManager({ onClose }: SyncQueueManagerProps) {
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [loadingAll, setLoadingAll] = useState(false);
  const failedItems = useLiveQuery(
    () => db.sync_queue.where('status').equals('failed').toArray(),
    []
  );

  const { requestConfirm } = useConfirmStore();
  const { addToast } = useToastStore();

  const handleRetry = async (id: number) => {
    setLoadingIds(new Set([...loadingIds, id]));
    try {
      await retrySyncItem(id);
      addToast({ type: 'success', title: 'Berhasil', message: 'Tugas telah dikembalikan ke antrean.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Gagal', message: err.message });
    } finally {
      const newIds = new Set(loadingIds);
      newIds.delete(id);
      setLoadingIds(newIds);
    }
  };

  const handleRetryAll = async () => {
    if (!failedItems || failedItems.length === 0) return;
    setLoadingAll(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const item of failedItems) {
      try {
        await retrySyncItem(item.id!);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }
    
    setLoadingAll(false);
    if (failCount === 0) {
      addToast({ type: 'success', title: 'Berhasil', message: `${successCount} tugas dikembalikan ke antrean.` });
    } else {
      addToast({ type: 'warning', title: 'Selesai parsial', message: `${successCount} berhasil, ${failCount} masih gagal dikembalikan.` });
    }
  };

  const handleDiscard = (id: number, aksi: string) => {
    requestConfirm({
      title: 'Buang Antrean?',
      description: aksi === 'insert' 
        ? 'Tugas ini adalah penambahan data baru. Jika dibuang, data lokal yang terkait akan dihapus secara permanen dari komputer ini.' 
        : 'Tugas ini adalah perubahan/penghapusan data. Jika dibuang, data lokal Anda akan ditimpa ulang (Revert) sesuai dengan versi asli di server Supabase.',
      confirmLabel: 'Ya, Buang & Revert',
      onConfirm: async () => {
        setLoadingIds(new Set([...loadingIds, id]));
        try {
          await discardSyncItem(id);
          addToast({ type: 'success', title: 'Berhasil', message: 'Antrean dibuang dan data lokal direvert.' });
        } catch (err: any) {
          addToast({ type: 'error', title: 'Gagal', message: err.message });
        } finally {
          const newIds = new Set(loadingIds);
          newIds.delete(id);
          setLoadingIds(newIds);
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning-500" />
              Manajemen Antrean Sinkronisasi
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Kelola tugas sinkronisasi yang gagal dikirim ke server.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {failedItems && failedItems.length > 1 && (
              <button 
                onClick={handleRetryAll}
                disabled={loadingAll}
                className="hidden md:inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loadingAll ? 'animate-spin' : ''}`} />
                {loadingAll ? 'Memproses...' : 'Coba Ulang Semua'}
              </button>
            )}
            <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {!failedItems ? (
            <div className="text-center py-8 text-slate-500 text-sm">Memuat...</div>
          ) : failedItems.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto w-16 h-16 rounded-full bg-success-50 text-success-500 flex items-center justify-center mb-4 dark:bg-success-950/30">
                <RefreshCw className="h-8 w-8" />
              </div>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-200">Tidak ada kegagalan</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Semua data berhasil disinkronisasi dengan baik.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {failedItems.map(item => (
                <div key={item.id} className="flex flex-col gap-4 md:flex-row md:items-center justify-between rounded-xl border border-danger-100 bg-danger-50/30 p-4 dark:border-danger-900/30 dark:bg-danger-950/10">
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-400">{item.tabel}</span>
                      <span className="rounded-md bg-warning-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning-700 dark:bg-warning-950 dark:text-warning-400">{item.action}</span>
                      <span className="text-xs text-slate-500 font-mono hidden md:inline">ID: {item.record_id.split('-')[0]}...</span>
                    </div>
                    <p className="text-sm font-semibold text-danger-700 dark:text-danger-400 line-clamp-2">Error: {item.error_message || 'Unknown error'}</p>
                    <p className="text-xs text-slate-500 mt-1">Gagal {item.retry_count} kali. {new Date(item.created_at).toLocaleString('id-ID')}</p>
                  </div>
                  
                  <div className="flex shrink-0 items-center gap-2">
                    <button 
                      onClick={() => handleRetry(item.id!)}
                      disabled={loadingIds.has(item.id!)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingIds.has(item.id!) ? 'animate-spin' : ''}`} />
                      {loadingIds.has(item.id!) ? 'Memproses...' : 'Coba Ulang'}
                    </button>
                    <button 
                      onClick={() => handleDiscard(item.id!, item.action)}
                      disabled={loadingIds.has(item.id!)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 bg-white px-3 py-2 text-sm font-bold text-danger-600 transition hover:bg-danger-50 hover:text-danger-700 disabled:opacity-50 dark:border-danger-900/50 dark:bg-slate-800 dark:text-danger-400 dark:hover:bg-danger-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                      Buang & Revert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
