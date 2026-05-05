import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { addChat, deleteChat } from '../features/nekokanSlice';

export default function SuspendChat({ roomId, onClose }) {
    const dispatch = useDispatch();
    const chats = useSelector(state => state.nekokan.chats || []);
    const visibleChats = chats.filter(c => !c.deleted);
    
    const [name, setName] = useState(localStorage.getItem('nekokan2_chat_name') || '');
    const [message, setMessage] = useState('');
    const chatBodyRef = useRef(null);

    const [userId] = useState(() => {
        let id = localStorage.getItem('nekokan2_user_id');
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem('nekokan2_user_id', id);
        }
        return id;
    });

    // Auto-scroll to bottom
    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [visibleChats]);

    const handleDelete = (id) => {
        if (window.confirm('このメッセージを削除しますか？')) {
            dispatch(deleteChat(id));
        }
    };

    const handleSend = (e) => {
        e.preventDefault();
        if (!message.trim()) return;
        
        const hashSuffix = userId.slice(-2).toUpperCase();
        const finalName = (name.trim() || '匿名') + '#' + hashSuffix;
        
        if (name.trim()) {
            localStorage.setItem('nekokan2_chat_name', name.trim());
        }

        const newChat = {
            id: crypto.randomUUID(),
            userId: userId,
            name: finalName,
            message: message.trim(),
            timestamp: Date.now()
        };

        dispatch(addChat(newChat));
        setMessage('');
    };

    return (
        <div 
            onClick={(e) => e.stopPropagation()} 
            style={{
                width: '90%',
                maxWidth: '400px',
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                height: '60vh',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                overflow: 'hidden'
            }}
        >
            <div style={{
                backgroundColor: '#334155',
                padding: '10px 15px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #475569'
            }}>
                <div style={{ fontWeight: 'bold', color: '#cbd5e1' }}>チャット (ルーム内共有)</div>
                <button 
                    onClick={onClose}
                    style={{
                        background: 'transparent', border: 'none', color: '#94a3b8',
                        cursor: 'pointer', fontSize: '1.2rem'
                    }}
                >
                    <i className="fas fa-times"></i>
                </button>
            </div>

            <div 
                ref={chatBodyRef}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                }}
            >
                {visibleChats.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#64748b', marginTop: '20px' }}>メッセージはありません</div>
                ) : (
                    visibleChats.map(chat => {
                        const hashSuffix = userId.slice(-2).toUpperCase();
                        const isMine = chat.userId ? chat.userId === userId : chat.name.endsWith('#' + hashSuffix);
                        const isOlderThanOneDay = Date.now() - chat.timestamp > 24 * 60 * 60 * 1000;
                        const canDelete = isMine || isOlderThanOneDay;
                        
                        return (
                        <div key={chat.id} style={{
                            backgroundColor: isMine ? '#1e40af' : '#334155',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            alignSelf: isMine ? 'flex-end' : 'flex-start',
                            maxWidth: '90%'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', gap: '10px' }}>
                                <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                                    {chat.name} <span style={{fontSize:'0.7rem', marginLeft:'5px'}}>{new Date(chat.timestamp).toLocaleTimeString('ja-JP', {hour12:false})}</span>
                                </div>
                                {canDelete && (
                                    <button
                                        onClick={() => handleDelete(chat.id)}
                                        style={{
                                            background: 'transparent', border: 'none', color: '#94a3b8',
                                            cursor: 'pointer', fontSize: '0.8rem', padding: '0'
                                        }}
                                        title="削除"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                )}
                            </div>
                            <div style={{ color: '#f1f5f9', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                {chat.message}
                            </div>
                        </div>
                    )})
                )}
            </div>

            <form onSubmit={handleSend} style={{
                backgroundColor: '#0f172a',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                <input 
                    type="text" 
                    placeholder="名前（省略可）" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                        padding: '6px', borderRadius: '4px', border: '1px solid #475569',
                        backgroundColor: '#1e293b', color: '#f1f5f9', fontSize: '0.9rem'
                    }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                        type="text" 
                        placeholder="メッセージを入力..." 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        style={{
                            flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #475569',
                            backgroundColor: '#1e293b', color: '#f1f5f9'
                        }}
                    />
                    <button type="submit" style={{
                        padding: '8px 15px', borderRadius: '4px', border: 'none',
                        backgroundColor: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 'bold'
                    }}>送信</button>
                </div>
            </form>
        </div>
    );
}
