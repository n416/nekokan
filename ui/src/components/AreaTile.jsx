import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { addLog, pushHistory } from '../features/nekokanSlice';

export default function AreaTile({ area, onOpenTimePicker, onOpenSettings, onLogAdded }) {
  const dispatch = useDispatch();
  const { timeDisplays, channelCounts, defaultChannelCount, highlightTarget, hoverTarget } = useSelector(state => state.nekokan);
  
  // 表示更新用タイマー
  const [nowTs, setNowTs] = React.useState(Date.now());
  React.useEffect(() => {
      const interval = setInterval(() => setNowTs(Date.now()), 15000);
      return () => clearInterval(interval);
  }, []);

  // このエリアのチャンネル数
  const count = channelCounts[area.name] || defaultChannelCount;
  
  const handleLogClick = (channel) => {
    dispatch(pushHistory());

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // 1時間後
    const future = new Date(now.getTime() + 60 * 60 * 1000);
    const futureStr = future.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    dispatch(addLog({
        areaName: area.name,
        channelName: channel,
        timeStr: timeStr,
        futureTimeStr: futureStr,
        futureTimeMs: future.getTime()
    }));
    
    onLogAdded(`${area.name} ${channel}のログを追加しました`);
  };

  // チャンネルリスト生成
  const channels = ['PVP'];
  for(let i=1; i<=count; i++) channels.push(`ch${i}`);

  return (
    <div className={`area-tile ${area.class}`}>
      <div className="area-title" onClick={() => onOpenSettings(area.name)}>{area.name}</div>
      {channels.map(ch => {
        const key = `${area.name}_${ch}`;
        let timeDisplay = timeDisplays[key];

        if (timeDisplay) {
            const diff = timeDisplay - nowTs;
            // 2時間(7200000ミリ秒)以上経過したものは非表示
            if (diff < -2 * 60 * 60 * 1000) {
                timeDisplay = null;
            }
        }

        // 判定: クリックによる点滅ターゲット
        const isBlinking = highlightTarget && highlightTarget.area === area.name && highlightTarget.channel === ch;
        // 判定: マウスホバーによるハイライトターゲット
        const isHovered = hoverTarget && hoverTarget.area === area.name && hoverTarget.channel === ch;

        // クラスの決定 (点滅優先)
        let rowClass = 'log-row';
        if (isBlinking) {
            rowClass += ' log-row-blink';
        } else if (isHovered) {
            rowClass += ' log-row-highlight';
        }

        return (
            <div key={ch} className={rowClass}>
                <div className="log-label" onClick={() => onOpenTimePicker(area.name, ch)}>
                    {ch}
                    {timeDisplay && (
                        <div className="time-display">
                            <i className="far fa-clock"></i>&nbsp;{new Date(timeDisplay).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </div>
                    )}
                </div>
                <div className="log-button-container">
                    <LogButton
                        onClick={() => handleLogClick(ch)}
                        hasTime={!!timeDisplay}
                    />
                </div>
            </div>
        );
      })}
    </div>
  );
}

function LogButton({ onClick, hasTime }) {
    const iconClass = hasTime ? 'fa-skull-crossbones' : 'fa-cat';

    return (
        <button
            className="btn log-btn"
            onClick={onClick}
        >
            {hasTime && iconClass === 'fa-skull-crossbones' && '!'}
            <i className={`fas ${iconClass}`}></i>
        </button>
    );
}
