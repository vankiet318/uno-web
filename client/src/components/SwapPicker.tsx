import { motion } from 'framer-motion';
import { LuArrowLeftRight, LuX } from 'react-icons/lu';
import type { PublicPlayer } from '@shared/types';
import { Avatar } from './Seat';

interface Props {
  players: PublicPlayer[];
  onPick: (id: string) => void;
  onCancel: () => void;
}

/** Luật 7-0: chọn người để đổi cả bài */
export function SwapPicker({ players, onPick, onCancel }: Props) {
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
      <motion.div
        className="panel swap-picker"
        initial={{ scale: 0.6, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>
          <LuArrowLeftRight /> Đổi bài với ai?
        </h3>
        <div className="swap-list">
          {players.map((p, i) => (
            <motion.button
              key={p.id}
              className="swap-row"
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onPick(p.id)}
            >
              <Avatar p={p} size={36} />
              <span className="pname">{p.name}</span>
              <span className="swap-count">{p.cardCount} lá</span>
            </motion.button>
          ))}
        </div>
        <button className="btn ghost wide" onClick={onCancel}>
          <LuX /> Huỷ
        </button>
      </motion.div>
    </motion.div>
  );
}
