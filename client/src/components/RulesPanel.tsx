import type { IconType } from 'react-icons';
import { LuArrowLeftRight, LuBan, LuFlame, LuLayers, LuRepeat, LuScrollText, LuTimer, LuTrophy, LuHand } from 'react-icons/lu';
import {
  CHAOS_SETTINGS, CLASSIC_SETTINGS, HAND_SIZES, TARGET_SCORES, TURN_SECONDS, type Settings,
} from '@shared/types';
import { actions } from '../net';

type BoolKey = 'stacking' | 'drawUntilPlayable' | 'sevenZero' | 'noActionFinish';

const TOGGLES: { key: BoolKey; icon: IconType; title: string; desc: string }[] = [
  { key: 'stacking', icon: LuLayers, title: 'Cộng dồn', desc: 'Chồng +2 lên +2, +4 lên +2/+4. Người cuối cùng ăn hết.' },
  { key: 'drawUntilPlayable', icon: LuRepeat, title: 'Rút đến khi đánh được', desc: 'Không có lá hợp lệ thì rút liên tục, được lá nào phải đánh lá đó.' },
  { key: 'sevenZero', icon: LuArrowLeftRight, title: 'Luật 7-0', desc: 'Đánh 7: đổi cả bài với 1 người. Đánh 0: cả bàn chuyền bài cho người kế.' },
  { key: 'noActionFinish', icon: LuBan, title: 'Không về bằng lá chức năng', desc: 'Lá cuối cùng phải là lá số.' },
];

const sameAs = (a: Settings, b: Settings) => (Object.keys(b) as (keyof Settings)[]).every((k) => a[k] === b[k]);

function Segment<T extends number>({ value, options, label, onPick, disabled }: {
  value: T;
  options: T[];
  label: (v: T) => string;
  onPick: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o} className={value === o ? 'active' : ''} disabled={disabled} onClick={() => onPick(o)}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

export function RulesPanel({ settings, editable }: { settings: Settings; editable: boolean }) {
  const set = (s: Partial<Settings>) => editable && void actions.settings(s);
  const isClassic = sameAs(settings, CLASSIC_SETTINGS);
  const isChaos = sameAs(settings, CHAOS_SETTINGS);

  return (
    <div className="rules">
      <div className="rules-head">
        <h3>Luật chơi</h3>
        {editable && (
          <div className="presets">
            <button className={`preset ${isClassic ? 'active' : ''}`} onClick={() => set(CLASSIC_SETTINGS)}>
              <LuScrollText /> Cổ điển
            </button>
            <button className={`preset chaos ${isChaos ? 'active' : ''}`} onClick={() => set(CHAOS_SETTINGS)}>
              <LuFlame /> Hỗn loạn
            </button>
          </div>
        )}
      </div>

      <div className="toggle-list">
        {TOGGLES.map(({ key, icon: Icon, title, desc }) => (
          <button
            key={key}
            className={`toggle ${settings[key] ? 'on' : ''}`}
            disabled={!editable}
            onClick={() => set({ [key]: !settings[key] })}
            aria-pressed={settings[key]}
          >
            <Icon className="toggle-ico" />
            <span className="toggle-text">
              <b>{title}</b>
              <small>{desc}</small>
            </span>
            <span className="switch" />
          </button>
        ))}
      </div>

      <div className="setting">
        <span>
          <LuHand className="set-ico" />
          <b>Số lá chia</b>
        </span>
        <Segment value={settings.handSize} options={HAND_SIZES} label={(v) => `${v} lá`} onPick={(v) => set({ handSize: v })} disabled={!editable} />
      </div>
      <div className="setting">
        <span>
          <LuTimer className="set-ico" />
          <b>Thời gian mỗi lượt</b>
        </span>
        <Segment value={settings.turnSeconds} options={TURN_SECONDS} label={(v) => (v ? `${v}s` : '∞')} onPick={(v) => set({ turnSeconds: v })} disabled={!editable} />
      </div>
      <div className="setting">
        <span>
          <LuTrophy className="set-ico" />
          <b>Điểm vô địch</b>
        </span>
        <Segment value={settings.targetScore} options={TARGET_SCORES} label={(v) => (v ? `${v}` : '∞')} onPick={(v) => set({ targetScore: v })} disabled={!editable} />
      </div>
    </div>
  );
}
