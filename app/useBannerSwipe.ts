'use client';

import { useCallback, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

type Gesture = { id: number; x: number; y: number; axis: 'horizontal' | 'vertical' | null };

/** 縦スクロールとピンチはブラウザへ任せ、横に送った指だけをバナー操作として扱う。 */
export default function useBannerSwipe(onSwipe: (direction: number) => void) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [interacting, setInteracting] = useState(false);
  const resetOnDetach = useCallback((node: HTMLDivElement | null) => {
    if (node) return;
    // 指を置いたまま別タブへ移ると、取り外された要素には pointerup が届かないことがある。
    // TOPへ戻ったときに自動切替が止まり続けないよう、要素の取り外しでも片付ける。
    gesture.current = null;
    suppressClick.current = false;
    setInteracting(false);
  }, []);

  function finish(event: PointerEvent<HTMLDivElement>) {
    gesture.current = null;
    setInteracting(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function updateDirection(event: PointerEvent<HTMLDivElement>, current: Gesture) {
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    // 小さな指の揺れはタップのまま。少し動かして戻した場合も誤って広告を開かない。
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
      suppressClick.current = true;
      if (!current.axis) {
        if (Math.abs(dx) > Math.abs(dy) * 1.2) current.axis = 'horizontal';
        else if (Math.abs(dy) >= Math.abs(dx)) current.axis = 'vertical';
      }
    }
    return { dx, dy };
  }

  return {
    interacting,
    handlers: {
      ref: resetOnDetach,
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (!event.isPrimary) {
          // 2本指になったらスワイプを取り消して、拡大操作を邪魔しない。
          if (gesture.current) {
            gesture.current = null;
            suppressClick.current = true;
            setInteracting(false);
          }
          return;
        }
        suppressClick.current = false;
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
        setInteracting(true);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        updateDirection(event, current);
        // 横送りと分かってからだけ捕まえる。通常のタップ先は元のボタンのままにする。
        if (current.axis === 'horizontal' && !event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const { dx, dy } = updateDirection(event, current);
        finish(event);
        if (current.axis === 'horizontal' && Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          onSwipe(dx < 0 ? 1 : -1);
        }
      },
      onPointerCancel(event: PointerEvent<HTMLDivElement>) {
        if (gesture.current?.id === event.pointerId) {
          suppressClick.current = true;
          finish(event);
        }
      },
      onLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
        if (event.target === event.currentTarget && gesture.current?.id === event.pointerId) finish(event);
      },
      onClickCapture(event: MouseEvent<HTMLDivElement>) {
        // スワイプ後の合成クリックだけを止める。キーボードと次の普通のタップは通す。
        if (suppressClick.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
    },
  };
}
