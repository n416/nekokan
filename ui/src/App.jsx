import React, { useEffect, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import LZString from 'lz-string';
import {
    loadInitialState, pushHistory, undo, redo, clearAllLogs, resetAll,
    toggleShowSeconds, toggleHideTime, setSharedMode, loadFromUrl, loadFromJson, updateAlarmSettings,
    updateLastReadChat
} from './features/nekokanSlice';
import AreaTile from './components/AreaTile';
import NoteCard from './components/NoteCard';
import TimePickerModal from './components/TimePickerModal';
import ChannelSettingsModal from './components/ChannelSettingsModal';
import DefaultChannelSettingsModal from './components/DefaultChannelSettingsModal';
import ConfirmModal from './components/ConfirmModal';
import CreateRoomModal from './components/CreateRoomModal';
import RoomPasswordModal from './components/RoomPasswordModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import { fetchRoomState, updateRoomState } from './api';
import SuspendChat from './components/SuspendChat';
import { useAudioAlarm } from './hooks/useAudioAlarm';
import { useTitleNotification } from './hooks/useTitleNotification';
import './App.css';

function App() {
    const dispatch = useDispatch();
    const { areas, logs, alarmSettings, showSeconds, hideTime, timeDisplays, channelCounts, disabledChannels, timestamps, chats, lastReadChatTimestamp } = useSelector(state => state.nekokan);
    const [toastMessage, setToastMessage] = useState('');

    const [activeModal, setActiveModal] = useState(null);
    const [modalData, setModalData] = useState(null);

    const [roomId, setRoomId] = useState(null);
    const [roomPassword, setRoomPassword] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [isJoiningRoom, setIsJoiningRoom] = useState(false); // 入室処理中のフラグ
    const [lastRoomId, setLastRoomId] = useState(localStorage.getItem('nekokan2_last_room'));
    const isInitialLoad = useRef(true);
    const isPullingRef = useRef(false);
    const lastActivityTime = useRef(Date.now());
    const pullIntervalRef = useRef(null);
    const [isIdle, setIsIdle] = useState(false);
    const isIdleRef = useRef(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    useEffect(() => {
        isIdleRef.current = isIdle;
    }, [isIdle]);

    const visibleChats = React.useMemo(() => chats ? chats.filter(c => !c.deleted) : [], [chats]);
    const hasUnreadChat = visibleChats.length > 0 && visibleChats[visibleChats.length - 1].timestamp > lastReadChatTimestamp;

    useEffect(() => {
        if (isChatOpen && visibleChats.length > 0) {
            const latest = visibleChats[visibleChats.length - 1].timestamp;
            if (latest > lastReadChatTimestamp) {
                dispatch(updateLastReadChat(latest));
            }
        }
    }, [isChatOpen, visibleChats, lastReadChatTimestamp, dispatch]);

    useAudioAlarm();
    useTitleNotification();

    // URLパラメータロード
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) {
            setRoomId(room);
            setLastRoomId(room);
            localStorage.setItem('nekokan2_last_room', room);
            setIsJoiningRoom(true);
            dispatch(setSharedMode(true));

            const isOwnerStr = localStorage.getItem('nekokan2_owner_' + room);
            if (isOwnerStr) setIsOwner(true);

            handleFetchRoom(room, '');
            return;
        }

        const data = params.get('data');
        if (data && logs.length > 0) {
            setActiveModal('overwrite');
            setModalData(data);
        } else if (data) {
            dispatch(loadFromUrl(data));
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    const leaveRoom = () => {
        window.history.replaceState(null, '', window.location.pathname);
        setRoomId(null);
        setIsOwner(false);
        setRoomPassword('');
        dispatch(setSharedMode(false));
        dispatch(loadInitialState());
        setIsIdle(false);
        showToast('プライベートモードに戻りました');
    };

    const joinLastRoom = () => {
        if (lastRoomId) {
            window.history.replaceState(null, '', `${window.location.pathname}?room=${lastRoomId}`);
            setRoomId(lastRoomId);
            setIsJoiningRoom(true);
            dispatch(setSharedMode(true));

            const isOwnerStr = localStorage.getItem('nekokan2_owner_' + lastRoomId);
            if (isOwnerStr) setIsOwner(true);

            handleFetchRoom(lastRoomId, '');
        }
    };

    const handleFetchRoom = async (id, pwd, silent = false) => {
        try {
            const res = await fetchRoomState(id, pwd);
            applyRoomState(res.state_json, pwd, silent);
            setIsJoiningRoom(false);
        } catch (e) {
            if (e.message === 'Unauthorized') {
                setActiveModal('roomPassword');
                setModalData({ roomId: id });
            } else {
                if (!silent) showToast('ルームの取得に失敗しました');
                setIsJoiningRoom(false);
            }
        }
    };

    const applyRoomState = (stateJson, pwd, silent = false) => {
        isPullingRef.current = true;
        try {
            const data = JSON.parse(stateJson);
            dispatch(loadFromJson(data));
            setRoomPassword(pwd);
            if (!silent) showToast('同期完了');
        } catch (e) {
            if (!silent) showToast('データ反映に失敗しました');
        } finally {
            setTimeout(() => { isPullingRef.current = false; }, 500);
        }
    };

    const pushTimerRef = useRef(null);
    const pendingPushDataRef = useRef(null);

    // 自動Push (ルームモード時)
    useEffect(() => {
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            return;
        }
        if (!roomId || isJoiningRoom) return;

        pendingPushDataRef.current = { logs, timeDisplays, channelCounts, disabledChannels, timestamps, chats };

        if (isPullingRef.current) return;

        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        
        pushTimerRef.current = setTimeout(() => {
            const dataToPush = pendingPushDataRef.current;
            updateRoomState(roomId, JSON.stringify(dataToPush), roomPassword).then(res => {
                if (res.merged_state) {
                    // 他人の変更が混ざって返ってきたらサイレントでUIに反映
                    applyRoomState(res.merged_state, roomPassword, true);
                }
            }).catch(e => {
                showToast('同期エラー: ' + e.message);
            });
        }, 800); // デバウンス処理: 連続更新による競合を防ぐ

    }, [logs, timeDisplays, channelCounts, disabledChannels, timestamps, chats, roomId, roomPassword, isJoiningRoom]);

    // ユーザーアクティビティの監視（10分放置判定用）
    useEffect(() => {
        const handleActivity = () => {
            if (!isIdleRef.current) {
                lastActivityTime.current = Date.now();
            }
        };
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('touchstart', handleActivity);

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
        };
    }, []);

    // スマート・ポーリング（フォーカス復帰、オンライン復帰、定期ポーリング）
    useEffect(() => {
        if (!roomId || isJoiningRoom) return;

        const doPull = () => {
            if (isPullingRef.current) return;
            handleFetchRoom(roomId, roomPassword, true); // silent pull
        };

        // 1. ブラウザ復帰時のイベントリスナー
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') doPull();
        };
        const handleFocus = () => { doPull(); };
        const handleOnline = () => { doPull(); };

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('online', handleOnline);

        // 2. 定期ポーリング（15秒間隔）
        pullIntervalRef.current = setInterval(() => {
            const IDLE_LIMIT = 10 * 60 * 1000; // 10分
            if (Date.now() - lastActivityTime.current > IDLE_LIMIT) {
                setIsIdle(true);
            }
            doPull();
        }, 15000);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleOnline);
            if (pullIntervalRef.current) clearInterval(pullIntervalRef.current);
        };
    }, [roomId, roomPassword, isJoiningRoom]);

    // ショートカットキー (Ctrl+Z, Ctrl+Y)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    e.preventDefault();
                    dispatch(undo());
                    showToast('Undo');
                } else if (e.key === 'y') {
                    e.preventDefault();
                    dispatch(redo());
                    showToast('Redo');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [dispatch]);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 3000);
    };

    const handleResetAll = () => {
        if (confirm('全てのデータと設定をリセットしますか？')) {
            localStorage.clear();
            window.location.reload();
        }
    };

    const handleSyncOrShare = () => {
        if (roomId) {
            // すでにルームにいる場合は手動Pull
            handleFetchRoom(roomId, roomPassword);
        } else {
            // 新規ルーム作成モーダルを開く
            setActiveModal('createRoom');
        }
    };

    return (
        <>
            <div className="header">
                <div className="top-left-align">
                    <button className="header-btn" onClick={handleResetAll} title="全リセット"><i className="fas fa-trash"></i></button>
                    <button className="header-btn" onClick={() => dispatch(undo())} title="元に戻す"><i className="fas fa-arrow-rotate-left"></i></button>
                    <button className="header-btn" onClick={() => dispatch(redo())} title="やり直す"><i className="fas fa-redo"></i></button>
                    {isOwner && (
                        <button className="header-btn" onClick={() => setActiveModal('changePassword')} title="パスワード変更 (部屋主限定)">
                            <i className="fas fa-key"></i>
                        </button>
                    )}
                    <button className="header-btn" style={roomId ? { color: '#4ade80' } : {}} onClick={handleSyncOrShare} title={roomId ? '手動同期 (Pull)' : 'ルームを作成して共有'}>
                        <i className="fas fa-sync-alt"></i>
                    </button>
                    {roomId && (
                        <button className="header-btn" style={{ color: '#94a3b8', position: 'relative' }} onClick={() => setIsIdle(true)} title="手動サスペンド">
                            <i className="fas fa-moon"></i>
                            {hasUnreadChat && (
                                <span style={{
                                    position: 'absolute',
                                    top: '4px',
                                    right: '4px',
                                    width: '8px',
                                    height: '8px',
                                    backgroundColor: '#ef4444',
                                    borderRadius: '50%',
                                    boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                                }}></span>
                            )}
                        </button>
                    )}
                </div>

                <div className="title" onClick={() => setActiveModal('defaultChannel')}>
                    ねこ缶 {roomId && !isJoiningRoom}
                </div>

                {roomId && (
                    <div className="top-right-align" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span className="shared-badge" style={{ fontSize: '0.7rem', backgroundColor: '#4ade80', color: '#fff', padding: '2px 5px', borderRadius: '3px', fontWeight: 'bold' }}>ルーム共有中</span>
                        <button
                            onClick={leaveRoom}
                            style={{ fontSize: '0.8rem', backgroundColor: '#666', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                            title="共有を解除して自分のデータに戻ります"
                        >
                            <i className="fa-solid fa-door-open"></i> <span className="hide-on-mobile">プライベートに戻る</span>
                        </button>
                    </div>
                )}

                {!roomId && lastRoomId && (
                    <div className="top-right-align" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <button
                            onClick={joinLastRoom}
                            style={{ fontSize: '0.8rem', backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                            title="最後に参加していた共有ルームに戻ります"
                        >
                            <i className="fa-solid fa-right-to-bracket"></i> <span>共有ルームへ戻る</span>
                        </button>
                    </div>
                )}
            </div>

            {isJoiningRoom ? (
                <div style={{ textAlign: 'center', marginTop: '100px', fontSize: '1.2em', color: '#666' }}>
                    {activeModal === 'roomPassword' ? 'ルームに入室するにはパスワードを入力してください' : 'ルームに入室しています...'}
                </div>
            ) : (
                <div className="container">
                    <div className="area-container">
                        {areas.map(area => (
                            <AreaTile
                                key={area.id}
                                area={area}
                                onOpenTimePicker={(areaName, channelName, btnRef) => {
                                    setActiveModal('timePicker');
                                    setModalData({ areaName, channelName });
                                }}
                                onOpenSettings={(areaName) => {
                                    setActiveModal('channelSettings');
                                    setModalData({ areaName });
                                }}
                                onLogAdded={(msg) => showToast(msg)}
                            />
                        ))}

                        {/* 元のbottom-sectionの中身をここに移動し、並列にする */}
                        <div className="note-wrapper">
                            <div id="digitalClock"><DigitalClock /></div>

                            <NoteCard />

                            <div className="note-controls">
                                <div id="toggleTimeDisplay" onClick={() => dispatch(toggleHideTime())} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '5px' }}>
                                    <i className={`fa-regular ${hideTime ? 'fa-square-check' : 'fa-square'}`} style={{ width: '20px', textAlign: 'center', marginRight: '5px' }}></i> 時刻非表示
                                </div>
                                <div id="toggleSecondsDisplay" onClick={() => dispatch(toggleShowSeconds())} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <i className={`fa-regular ${showSeconds ? 'fa-square-check' : 'fa-square'}`} style={{ width: '20px', textAlign: 'center', marginRight: '5px' }}></i> 秒表示
                                </div>
                            </div>
                        </div>

                        <div className="alarm-settings">
                            <label><input type="checkbox" checked={alarmSettings.alarm1min} onChange={e => dispatch(updateAlarmSettings({ alarm1min: e.target.checked }))} /> 1分前</label>
                            <label><input type="checkbox" checked={alarmSettings.alarm3min} onChange={e => dispatch(updateAlarmSettings({ alarm3min: e.target.checked }))} /> 3分前</label>
                            <label><input type="checkbox" checked={alarmSettings.alarm5min} onChange={e => dispatch(updateAlarmSettings({ alarm5min: e.target.checked }))} /> 5分前</label>
                            <label><input type="checkbox" checked={alarmSettings.muted} onChange={e => dispatch(updateAlarmSettings({ muted: e.target.checked }))} /> 鳴らさない</label>
                        </div>
                    </div>
                </div>
            )}

            <div className={`toast ${toastMessage ? 'show' : ''}`}>{toastMessage}</div>

            {isIdle && roomId && (
                <div
                    onClick={() => {
                        if (isChatOpen) return;
                        setIsIdle(false);
                        lastActivityTime.current = Date.now();
                        handleFetchRoom(roomId, roomPassword);
                    }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        backgroundColor: 'rgba(50, 50, 50, 0.85)',
                        zIndex: 9999,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        color: 'white',
                        flexDirection: 'column',
                        cursor: isChatOpen ? 'default' : 'pointer',
                        backdropFilter: 'blur(3px)'
                    }}
                >
                    {isChatOpen ? (
                        <SuspendChat roomId={roomId} onClose={() => setIsChatOpen(false)} />
                    ) : (
                        <>
                            <i className="fas fa-moon" style={{ fontSize: '4rem', marginBottom: '20px', color: '#cbd5e1' }}></i>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '10px' }}>サスペンドモード</div>
                            <div style={{ fontSize: '1rem', color: '#94a3b8' }}>画面をクリックして更新・再開</div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsChatOpen(true); }}
                                style={{
                                    marginTop: '30px', padding: '10px 25px', fontSize: '1.1rem',
                                    backgroundColor: '#3b82f6', color: 'white', border: 'none',
                                    borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                                    position: 'relative'
                                }}
                            >
                                <i className="fas fa-comments" style={{ marginRight: '8px' }}></i>チャットを開く
                                {hasUnreadChat && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-4px',
                                        right: '-4px',
                                        width: '14px',
                                        height: '14px',
                                        backgroundColor: '#ef4444',
                                        borderRadius: '50%',
                                        border: '2px solid rgba(50,50,50,0.85)'
                                    }}></span>
                                )}
                            </button>
                        </>
                    )}
                </div>
            )}

            {activeModal === 'timePicker' && (
                <TimePickerModal
                    data={modalData}
                    onClose={() => setActiveModal(null)}
                    onToast={showToast}
                />
            )}
            {activeModal === 'channelSettings' && (
                <ChannelSettingsModal
                    areaName={modalData.areaName}
                    onClose={() => setActiveModal(null)}
                    onToast={showToast}
                />
            )}
            {activeModal === 'defaultChannel' && (
                <DefaultChannelSettingsModal onClose={() => setActiveModal(null)} onToast={showToast} />
            )}
            {activeModal === 'overwrite' && (
                <ConfirmModal
                    message="データが含まれています。上書きしますか？"
                    onConfirm={() => {
                        dispatch(loadFromUrl(modalData));
                        window.history.replaceState(null, '', window.location.pathname);
                        setActiveModal(null);
                        showToast('ロードしました');
                    }}
                    onCancel={() => {
                        window.history.replaceState(null, '', window.location.pathname);
                        setActiveModal(null);
                    }}
                    yesText="上書き"
                    noText="キャンセル"
                />
            )}
            {activeModal === 'createRoom' && (
                <CreateRoomModal
                    onClose={() => setActiveModal(null)}
                    onToast={showToast}
                    onRoomCreated={(id, pwd) => {
                        setRoomId(id);
                        setLastRoomId(id);
                        localStorage.setItem('nekokan2_last_room', id);
                        setRoomPassword(pwd);
                        setIsOwner(true);
                        dispatch(setSharedMode(true));
                        window.history.replaceState(null, '', `${window.location.pathname}?room=${id}`);
                    }}
                />
            )}
            {activeModal === 'roomPassword' && (
                <RoomPasswordModal
                    roomId={modalData?.roomId}
                    onClose={() => setActiveModal(null)}
                    onToast={showToast}
                    onSuccess={(stateJson, pwd) => {
                        applyRoomState(stateJson, pwd);
                        setIsJoiningRoom(false);
                    }}
                    onCancel={() => {
                        window.history.replaceState(null, '', window.location.pathname);
                        setRoomId(null);
                        setIsJoiningRoom(false);
                    }}
                />
            )}
            {activeModal === 'changePassword' && (
                <ChangePasswordModal
                    roomId={roomId}
                    onClose={() => setActiveModal(null)}
                    onToast={showToast}
                    onPasswordChanged={(newPwd) => setRoomPassword(newPwd)}
                />
            )}
        </>
    );
}

function DigitalClock() {
    const [time, setTime] = useState('');

    useEffect(() => {
        let timer;
        let timeout;

        // 現在時刻をセットし、次の0ミリ秒ぴったりにタイマーを同期させる
        const syncClock = () => {
            const now = new Date();
            setTime(now.toLocaleTimeString('ja-JP', { hour12: false }));

            // 次の秒までの残りミリ秒を計算
            const msUntilNextSecond = 1000 - now.getMilliseconds();

            // 次の秒のタイミングで1秒ごとのsetIntervalを開始
            timeout = setTimeout(() => {
                setTime(new Date().toLocaleTimeString('ja-JP', { hour12: false }));
                timer = setInterval(() => {
                    setTime(new Date().toLocaleTimeString('ja-JP', { hour12: false }));
                }, 1000);
            }, msUntilNextSecond);
        };

        syncClock();

        return () => {
            clearTimeout(timeout);
            clearInterval(timer);
        };
    }, []);

    return <>{time}</>;
}

export default App;
