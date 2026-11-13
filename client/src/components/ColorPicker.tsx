import { motion } from 'framer-motion';
import { COLOR_NAMES_VI, COLORS, type Color } from '@shared/types';
import { HEX } from '../director';

interface Props {
  onPick: (c: Color) => void;
  onCancel: () => void;
}

const ANGLES = [-135, -45, 135, 45]; // vị trí 4 múi: trên-trái, trên-phải, dưới-trái, dưới-phải

export function ColorPicker({ onPick, onCancel }: Props) {
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
      <motion.div
        className="color-wheel"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        exit={{ scale: 0, rotate: 180 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        onClick={(e) => e.stopPropagation()}
      >
        {COLORS.map((c, i) => {
          const a = (ANGLES[i] * Math.PI) / 180;
          return (
            <motion.button
              key={c}
              className="color-btn"
              style={{ background: HEX[c] }}
              initial={{ x: 0, y: 0 }}
              animate={{ x: Math.cos(a) * 62, y: Math.sin(a) * 62 }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              transition={{ delay: 0.05 * i, type: 'spring' }}
              onClick={() => onPick(c)}
            >
              {COLOR_NAMES_VI[c]}
            </motion.button>
          );
        })}
        <div className="wheel-title">Chọn màu</div>
      </motion.div>
    </motion.div>
  );
}
