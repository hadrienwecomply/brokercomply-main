'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListChecks, FolderOpen, Mail, FileText, Globe } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Tab navigation for a broker's sub-pages (Plan d'action / Formulaires / Conversations / Documents). */
export function BrokerTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/courtiers/${slug}`;
  const tabs = [
    { href: base, label: "Plan d'action", icon: ListChecks },
    { href: `${base}/formulaires`, label: 'Formulaires', icon: FileText },
    { href: `${base}/conversations`, label: 'Conversations', icon: Mail },
    { href: `${base}/documents`, label: 'Documents', icon: FolderOpen },
    { href: `${base}/audit`, label: 'Audit site web', icon: Globe },
  ];

  return (
    <nav className="flex gap-1 border-b border-line" aria-label="Sections du courtier">
      {tabs.map((tab) => {
        // The plan tab is the index route; match it exactly. Other tabs match by prefix.
        const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors -mb-px',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-soft hover:text-ink',
            )}
          >
            <Icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
