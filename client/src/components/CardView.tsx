import { memo } from 'react';
import type { Card } from '@shared/types';
import { cardClass, cardInner } from '../cardHtml';

interface Props {
  card: Card | null;
  className?: string;
  small?: boolean;
}

/** Lá bài vẽ bằng CSS. card = null → mặt sau */
export const CardView = memo(function CardView({ card, className = '', small }: Props) {
  return <div className={`${cardClass(card, small)} ${className}`} dangerouslySetInnerHTML={{ __html: cardInner(card) }} />;
});
