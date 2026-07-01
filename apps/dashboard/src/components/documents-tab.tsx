import { ExternalLink, Download, FolderPlus, RefreshCw, Upload, FileText } from 'lucide-react';
import type { Broker } from '@/lib/types';
import type { DocumentDTO } from '@/lib/documents.server';
import { syncBrokerDocuments, retryBrokerFolder } from '@/lib/documents-actions';

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-BE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'error';
  title: string;
  children?: React.ReactNode;
}) {
  const toneCls =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-line bg-slate-50 text-ink-soft';
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 ${toneCls}`}
    >
      <div>
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Documents tab: lists the broker's SharePoint files (flat) with open/download,
 * an upload control (push to SharePoint), a manual sync button, and state
 * banners (pending/error/not-configured) with a retry action.
 */
export function DocumentsTab({
  broker,
  documents,
  configured,
}: {
  broker: Broker;
  documents: DocumentDTO[];
  configured: boolean;
}) {
  const status = broker.sharePointStatus;
  const linked = status === 'linked' && Boolean(broker.sharePointFolderId);

  if (!configured) {
    return (
      <Banner tone="info" title="SharePoint n'est pas configuré dans cet environnement.">
        <p className="text-sm">
          Renseignez <code>AZURE_*</code> et <code>SHAREPOINT_SITE_ID</code> pour activer la
          synchronisation des documents.
        </p>
      </Banner>
    );
  }

  if (!linked) {
    const retry = retryBrokerFolder.bind(null, broker.id);
    const isError = status === 'error';
    return (
      <Banner
        tone={isError ? 'error' : 'warn'}
        title={
          isError
            ? 'Conflit : un autre courtier utilise déjà ce dossier.'
            : "Le dossier SharePoint n'est pas encore relié."
        }
      >
        <form action={retry} className="mt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <FolderPlus className="size-4" />
            {isError ? 'Réessayer' : 'Créer / relier le dossier'}
          </button>
        </form>
      </Banner>
    );
  }

  const sync = syncBrokerDocuments.bind(null, broker.id);

  return (
    <div className="space-y-4">
      {/* Toolbar: open folder, sync, upload */}
      <div className="flex flex-wrap items-center gap-2">
        {broker.sharePointWebUrl && (
          <a
            href={broker.sharePointWebUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink"
          >
            <ExternalLink className="size-4" />
            Ouvrir le dossier
          </a>
        )}
        <form action={sync}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink"
          >
            <RefreshCw className="size-4" />
            Synchroniser
          </button>
        </form>

        <form
          action={`/api/brokers/${broker.dbId}/documents`}
          method="post"
          encType="multipart/form-data"
          className="ml-auto flex items-center gap-2"
        >
          <input
            type="file"
            name="file"
            required
            className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Upload className="size-4" />
            Envoyer
          </button>
        </form>
      </div>

      {/* File list */}
      {documents.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-ink-soft">
          Aucun document. Envoyez un fichier ci-dessus, ou ajoutez-en dans SharePoint puis
          synchronisez.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Modifié</th>
                <th className="px-4 py-2 font-medium">Taille</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 shrink-0 text-ink-soft" />
                      <span className="font-medium text-ink">{doc.name}</span>
                    </div>
                    {doc.path && <span className="text-xs text-ink-soft">{doc.path}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{formatDate(doc.lastModifiedAt)}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{formatBytes(doc.size)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-3">
                      {doc.webUrl && (
                        <a
                          href={doc.webUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                        >
                          <ExternalLink className="size-3.5" />
                          Ouvrir
                        </a>
                      )}
                      <a
                        href={`/api/brokers/${broker.dbId}/documents/${encodeURIComponent(doc.id)}/download`}
                        className="inline-flex items-center gap-1 text-ink-soft hover:text-ink"
                      >
                        <Download className="size-3.5" />
                        Télécharger
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
