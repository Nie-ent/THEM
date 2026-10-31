import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { useTranslation } from 'react-i18next';
import { i18n } from '@them/i18n';
import { I18nextProvider } from 'react-i18next';

class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }
  create(): void {
    const g = this.add.graphics();
    g.fillStyle(0x8080ff, 1);
    g.fillCircle(this.scale.width / 2, this.scale.height / 2, 24);
  }
}

function Overlay() {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute inset-0 p-md" data-testid="overlay">
      <h1 className="font-display text-text">{t('app.title')}</h1>
    </div>
  );
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      backgroundColor: '#1a1a1a',
      scale: { mode: Phaser.Scale.RESIZE },
      scene: [BootScene],
    });
    return () => game.destroy(true);
  }, []);
  return (
    <I18nextProvider i18n={i18n}>
      <div className="relative h-full w-full">
        <div ref={host} className="absolute inset-0" data-testid="stage" />
        <Overlay />
      </div>
    </I18nextProvider>
  );
}
