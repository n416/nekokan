import React, { useMemo, useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setHighlightTarget, setHoverTarget } from '../features/nekokanSlice';

export default function NoteCard() {
  const dispatch = useDispatch();
  const { timeDisplays, showSeconds, hideTime } = useSelector(state => state.nekokan);

  // 負荷軽減のため、15秒に1回だけ現在時刻を更新して再描画する
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
      const interval = setInterval(() => setNowTs(Date.now()), 15000);
      return () => clearInterval(interval);
  }, []);

  // ログエントリの生成とソート
  const entries = useMemo(() => {
    const arr = [];
    const now = new Date(nowTs);
    const fiveMin = 5 * 60 * 1000;
    
    Object.entries(timeDisplays).forEach(([key, timeMs]) => {
        const [area, channel] = key.split('_');
        const logTime = new Date(timeMs);
        const diff = logTime - now;
        
        // 2時間(7200000ミリ秒)以上経過したものは除外する
        if (diff < -2 * 60 * 60 * 1000) {
            return;
        }
        
        let className = '';
        if (diff > -fiveMin && diff <= fiveMin) {
            className = 'soon-log';
        } else if (diff <= -fiveMin) {
            className = 'past-log';
        }
        
        const timeStr = logTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        
        arr.push({
            key, area, channel, timeStr, logTime, className, diff
        });
    });

    arr.sort((a, b) => a.logTime.getTime() - b.logTime.getTime());

    const future = arr.find(e => e.diff > 0);
    if (future) future.className += ' closest-log';
    
    return arr;
  }, [timeDisplays, nowTs]);

  // 表示用フォーマット
  const renderEntries = () => {
    let lastArea = null;
    return entries.map((entry, index) => {
        const showSeparator = lastArea !== entry.area;
        lastArea = entry.area;
        
        let timePart = '';
        if (!hideTime) {
            timePart = showSeconds ? entry.timeStr : entry.timeStr.substring(0, 5);
        }

        return (
            <React.Fragment key={entry.key}>
                {index > 0 && showSeparator && <hr />}
                {index > 0 && !showSeparator && ' → '}
                
                <span 
                    className={`${entry.className}`}
                    style={{ cursor: 'pointer' }}
                    // クリック時: 点滅アニメーション
                    onClick={() => {
                        dispatch(setHighlightTarget({ area: entry.area, channel: entry.channel }));
                        setTimeout(() => {
                            dispatch(setHighlightTarget(null));
                        }, 3000);
                    }}
                    // ホバー時: 背景色ハイライト
                    onMouseEnter={() => {
                        dispatch(setHoverTarget({ area: entry.area, channel: entry.channel }));
                    }}
                    onMouseLeave={() => {
                        dispatch(setHoverTarget(null));
                    }}
                >
                    {showSeparator ? `${entry.area} ${entry.channel}` : entry.channel}
                    {timePart && ` ${timePart}`}
                </span>
            </React.Fragment>
        );
    });
  };

  return (
    <div id="noteCard" className={`area-tile ${entries.length > 0 ? 'active' : ''}`}>
        {renderEntries()}
    </div>
  );
}
