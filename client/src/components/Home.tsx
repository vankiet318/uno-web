import { motion } from 'framer-motion';
import { useState } from 'react';
import { LuLogIn, LuSparkles } from 'react-icons/lu';
import { createRoom, joinRoom, roomFromUrl, savedName } from '../net';
import { unlockAudio } from '../sound';
import { toast } from '../store';
import { Showcase } from './Showcase';

export function Home() {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(roomFromUrl());
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    unlockAudio();
    if (!name.trim()) {
      toast('Nhập tên của bạn trước nhé');
      return;
    }
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) toast(res.error ?? 'Lỗi');
  };

  return (
    <div className="home">
      <Showcase />
      <motion.h1 className="title" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: 'spring' }}>
        UNO <span>cùng bạn bè</span>
      </motion.h1>

      <motion.div className="panel home-panel" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}>
        <label className="field">
          <span>Tên của bạn</span>
          <input value={name} maxLength={20} placeholder="VD: Tuấn" onChange={(e) => setName(e.target.value)} />
        </label>

        <button className="btn primary wide big" disabled={busy} onClick={() => go(() => createRoom(name.trim()))}>
          <LuSparkles /> Tạo phòng mới
        </button>

        <div className="divider">hoặc vào phòng có sẵn</div>

        <div className="row">
          <input
            className="code-input"
            value={code}
            maxLength={5}
            placeholder="MÃ PHÒNG"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && code && go(() => joinRoom(code, name.trim()))}
          />
          <button className="btn" disabled={busy || code.length < 5} onClick={() => go(() => joinRoom(code, name.trim()))}>
            <LuLogIn /> Vào phòng
          </button>
        </div>
      </motion.div>
    </div>
  );
}
