'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Mail,
  Paperclip,
  RefreshCw,
} from 'lucide-react';
import type { ConversationDTO, ConversationsData } from '@/lib/conversations.server';
import { setMatchDomains } from '@/lib/broker-actions';
import { cn } from '@/lib/cn';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-BE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DirectionTag({ direction }: { direction: string | null }) {
  const outbound = direction === 'outbound';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        outbound ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-ink-soft',
      )}
    >
      {outbound ? <ArrowUpRight className="size-3" /> : <ArrowDownLeft className="size-3" />}
      {outbound ? 'Envoyé' : 'Reçu'}
    </span>
  );
}

/**
 * Conversations tab: the latest email threads with a broker, sourced from the
 * (AML-filtered) ingested archive. Master-detail; freshness badge; opt-in domain
 * matching; per-message "open in Outlook" deep link.
 */
export function ConversationsTab({
  slug,
  brokerEmails,
  matchDomains,
  candidateDomains,
  data,
}: {
  slug: string;
  brokerEmails: string[];
  matchDomains: string[];
  candidateDomains: string[];
  data: ConversationsData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { conversations, lastSyncedAt } = data;
  const [selectedKey, setSelectedKey] = useState<string | null>(conversations[0]?.key ?? null);
  const selected: ConversationDTO | undefined =
    conversations.find((c) => c.key === selectedKey) ?? conversations[0];

  const toggleDomain = (domain: string, on: boolean) => {
    const next = on
      ? [...new Set([...matchDomains, domain])]
      : matchDomains.filter((d) => d !== domain);
    startTransition(async () => {
      await setMatchDomains(slug, next);
      router.refresh();
    });
  };

  const hasAddresses = brokerEmails.length > 0 || matchDomains.length > 0;

  return (
    <div className="space-y-4">
      {/* Freshness + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          {lastSyncedAt
            ? `Données synchronisées le ${formatDateTime(lastSyncedAt)}`
            : 'Aucune synchronisation enregistrée — affichage des emails déjà importés.'}
        </p>
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
        >
          <RefreshCw className={cn('size-4', pending && 'animate-spin')} />
          Rafraîchir
        </button>
      </div>

      {/* Opt-in domain matching */}
      {candidateDomains.length > 0 && (
        <div className="rounded-md border border-line bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-ink">Inclure aussi tout un domaine</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Élargit le rapprochement à toutes les adresses d'un domaine. Les domaines publics
            (gmail, outlook…) sont volontairement exclus.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {candidateDomains.map((domain) => {
              const on = matchDomains.includes(domain);
              return (
                <button
                  key={domain}
                  type="button"
                  onClick={() => toggleDomain(domain, !on)}
                  disabled={pending}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                    on
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-line text-ink-soft hover:text-ink',
                  )}
                >
                  @{domain} {on ? '✓' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty states */}
      {!hasAddresses ? (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center">
          <Mail className="mx-auto size-8 text-ink-soft/50" />
          <p className="mt-2 text-sm font-medium text-ink">Aucune adresse email liée</p>
          <p className="mt-1 text-sm text-ink-soft">
            Ajoutez les adresses du courtier dans sa fiche pour afficher les conversations.
          </p>
        </div>
      ) : conversations.length === 0 ? (
        <div className="rounded-md border border-line bg-white px-4 py-10 text-center">
          <Mail className="mx-auto size-8 text-ink-soft/50" />
          <p className="mt-2 text-sm font-medium text-ink">Aucune conversation trouvée</p>
          <p className="mt-1 text-sm text-ink-soft">
            Aucun email importé ne correspond à ce courtier pour l'instant.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
          {/* Thread list */}
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
            {conversations.map((c) => {
              const active = selected?.key === c.key;
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(c.key)}
                    className={cn(
                      'flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-brand-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {c.subject || '(sans objet)'}
                      </span>
                      <DirectionTag direction={c.lastDirection} />
                    </div>
                    <span className="text-xs text-ink-soft">
                      {formatDateTime(c.lastMessageAt)} · {c.messageCount} message
                      {c.messageCount > 1 ? 's' : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Thread detail */}
          <div className="space-y-3">
            {selected && (
              <>
                <h3 className="font-display text-lg font-semibold text-ink">
                  {selected.subject || '(sans objet)'}
                </h3>
                {selected.messages.map((m) => (
                  <article key={m.id} className="rounded-md border border-line bg-white p-3">
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <DirectionTag direction={m.direction} />
                        <span className="text-sm font-medium text-ink">{m.sender || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-ink-soft">{formatDateTime(m.receivedAt)}</span>
                        {m.webLink && (
                          <a
                            href={m.webLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            Outlook
                          </a>
                        )}
                      </div>
                    </header>
                    {m.recipients.length > 0 && (
                      <p className="mt-1 truncate text-xs text-ink-soft">À : {m.recipients.join(', ')}</p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
                      {m.bodyClean || <span className="italic text-ink-soft">(corps vide)</span>}
                    </p>
                    {m.attachmentNames.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.attachmentNames.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 rounded border border-line bg-slate-50 px-2 py-0.5 text-xs text-ink-soft"
                          >
                            <Paperclip className="size-3" />
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
