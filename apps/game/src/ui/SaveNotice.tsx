/** Visible (touch-safe) notice when the save was replaced or comes from a newer build (QA-P2-004). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { profileStore, useProfile } from '../game/profile';
import { Button, WarnIcon, Wrap } from './kit';

export function SaveNotice() {
  const { t } = useTranslation();
  useProfile();
  const [dismissed, setDismissed] = useState(false);
  const status = profileStore.loadStatus;
  if (status !== 'corrupt' && status !== 'newer') return null;
  if (status === 'corrupt' && dismissed) return null;
  const body = status === 'newer'
    ? t('ui.save.newer')
    : profileStore.backupKey ? t('ui.save.corrupt', { key: profileStore.backupKey }) : t('ui.save.corruptNoBackup');
  return (
    <div data-testid={`save-notice-${status}`} role="status" className="pointer-events-auto flex items-start gap-3 rounded-md border border-semantic-warning bg-surface p-3 md:max-w-120">
      <WarnIcon size={20} color="var(--them-color-semantic-warning)" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-md leading-body"><Wrap text={body} /></p>
        {status === 'corrupt' && <Button data-testid="save-notice-dismiss" variant="secondary" className="self-start" onClick={() => setDismissed(true)}>{t('ui.save.dismiss')}</Button>}
      </div>
    </div>
  );
}
