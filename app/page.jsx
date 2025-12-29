"use client";
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  setDoc,
  doc,
  query, 
  onSnapshot, 
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Lock, 
  Send, 
  Image as ImageIcon, 
  Loader2, 
  LogOut,
  EyeOff,
  AlertTriangle,
  RefreshCw,
  Hash
} from 'lucide-react';
import { format } from 'date-fns';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBRL2GkvUVRSoCG7CxHyYnAX3AaVVe9eUI",
  authDomain: "chat-bde6a.firebaseapp.com",
  projectId: "chat-bde6a",
  storageBucket: "chat-bde6a.firebasestorage.app",
  messagingSenderId: "482872393248",
  appId: "1:482872393248:web:13a633c2fa06b2edba0645"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const APP_ID = 'ourspace-v2-secure'; // Updated version namespace

// --- NATIVE UTILITIES ---

const compressImageNative = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
  });
};

const getCryptoKey = async (password) => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("ourspace-salt-v2"), 
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

const encryptData = async (text, password) => {
  try {
    const key = await getCryptoKey(password);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv }, key, enc.encode(text)
    );
    const ivArr = Array.from(iv);
    const contentArr = Array.from(new Uint8Array(encryptedContent));
    return btoa(String.fromCharCode.apply(null, ivArr.concat(contentArr)));
  } catch (e) { return ""; }
};

const decryptData = async (encryptedBase64, password) => {
  try {
    const binaryStr = atob(encryptedBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    const key = await getCryptoKey(password);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv }, key, data
    );
    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (e) { return null; }
};

const hashRoomId = async (roomName) => {
  const enc = new TextEncoder();
  const data = enc.encode(roomName);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// --- COMPONENTS ---

const MessageBubble = ({ msg, secretKey, name }) => {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('decrypting'); // decrypting, success, fail
  const isMe = msg.sender === name;

  useEffect(() => {
    let mounted = true;
    const process = async () => {
      const result = await decryptData(msg.encryptedContent, secretKey);
      if (mounted) {
        if (result) {
          setContent(result);
          setStatus('success');
        } else {
          setContent('🔒 Encrypted Message (Wrong Key)');
          setStatus('fail');
        }
      }
    };
    process();
    return () => { mounted = false; };
  }, [msg.encryptedContent, secretKey]);

  if (status === 'decrypting') return <div className="p-3 bg-slate-100 rounded-lg animate-pulse w-24 h-8" />;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm relative select-none group
        ${isMe 
          ? 'bg-slate-800 text-white rounded-tr-none' 
          : status === 'fail' 
            ? 'bg-red-50 text-red-500 border border-red-100'
            : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'}
      `}
      onContextMenu={(e) => e.preventDefault()}
    >
      {msg.type === 'image' && status === 'success' ? (
        <img src={content} alt="Content" className="rounded-lg max-w-full pointer-events-none" />
      ) : (
        <p className="whitespace-pre-wrap leading-relaxed flex items-center gap-2">
          {status === 'fail' && <Lock className="w-3 h-3" />}
          {content}
        </p>
      )}
    </motion.div>
  );
};

// --- MAIN PAGE ---

export default function OurSpace() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login');
  
  // Login State
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(''); // Public Room Name
  const [secretKey, setSecretKey] = useState(''); // Private Encryption Key
  const [roomId, setRoomId] = useState('');
  
  // Chat State
  const [messages, setMessages] = useState([]);
  const [activePartners, setActivePartners] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  
  const scrollRef = useRef(null);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsubAuth = onAuthStateChanged(auth, setUser);

    const handleVisibility = () => {
      if (document.hidden) setIsBlurred(true);
      else setIsBlurred(false);
    };
    
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", () => setIsBlurred(true));
    window.addEventListener("focus", () => setIsBlurred(false));

    return () => {
      unsubAuth();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", () => setIsBlurred(true));
      window.removeEventListener("focus", () => setIsBlurred(false));
    };
  }, []);

  useEffect(() => {
    if (view !== 'chat' || !roomId || !name) return;

    // Presence (Uses Room ID)
    const presenceCollectionId = `${roomId}_presence`;
    const presenceRef = doc(db, 'artifacts', APP_ID, 'public', 'data', presenceCollectionId, name);
    
    const heartbeat = setInterval(() => {
      setDoc(presenceRef, { 
        name, 
        lastSeen: serverTimestamp(),
        status: 'online'
      });
    }, 5000); 

    setDoc(presenceRef, { name, lastSeen: serverTimestamp(), status: 'online' });

    const presenceColl = collection(db, 'artifacts', APP_ID, 'public', 'data', presenceCollectionId);
    const unsubPresence = onSnapshot(presenceColl, (snapshot) => {
      const partners = [];
      const now = Date.now();
      snapshot.forEach(doc => {
        const data = doc.data();
        const lastSeenTime = data.lastSeen?.toMillis?.() || 0;
        if (data.name !== name && (now - lastSeenTime < 15000)) {
            partners.push(data.name);
        }
      });
      setActivePartners(partners);
    });

    // Messages (Uses Room ID)
    const messagesRef = collection(db, 'artifacts', APP_ID, 'public', 'data', roomId);
    
    const unsubMessages = onSnapshot(query(messagesRef), (snapshot) => {
      const msgs = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date(),
        }))
        .sort((a, b) => a.createdAt - b.createdAt);
      
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    return () => {
      clearInterval(heartbeat);
      unsubPresence();
      unsubMessages();
      deleteDoc(presenceRef); 
    };
  }, [view, roomId, name]);

  const generateRandomRoom = () => {
    const random = Array.from(window.crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    setRoomCode(`room-${random}`);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!name.trim() || !roomCode.trim() || !secretKey.trim()) return;
    
    // Hash the Room Code to find the collection (Location)
    const id = await hashRoomId(roomCode);
    setRoomId(id);
    setView('chat');
  };

  const handleLogout = () => {
    if (confirm("End secure session?")) window.location.reload();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    await sendMessage(text, 'text');
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsSending(true);
    try {
      const base64 = await compressImageNative(file);
      await sendMessage(base64, 'image');
    } catch (err) { alert("Image failed"); }
    setIsSending(false);
  };

  const sendMessage = async (content, type) => {
    try {
      // Encrypt using the Secret Key (Lock), NOT the Room Code
      const encrypted = await encryptData(content, secretKey);
      const messagesRef = collection(db, 'artifacts', APP_ID, 'public', 'data', roomId);
      await addDoc(messagesRef, {
        encryptedContent: encrypted,
        sender: name,
        type: type,
        createdAt: serverTimestamp()
      });
    } catch (e) { console.error(e); }
  };

  return (
    <div 
      className="min-h-screen bg-slate-50 text-slate-900 font-sans select-none overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      <AnimatePresence mode="wait">
        
        {isBlurred && view === 'chat' && (
          <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-xl flex flex-col items-center justify-center text-white p-6 text-center">
            <EyeOff className="w-16 h-16 mb-4 text-slate-400" />
            <h2 className="text-2xl font-bold mb-2">Private View Active</h2>
            <p className="text-slate-400">Content hidden while window is inactive.</p>
            <button 
              onClick={() => setIsBlurred(false)}
              className="mt-6 px-6 py-2 bg-white text-slate-900 rounded-full font-bold"
            >
              Resume Session
            </button>
          </div>
        )}

        {view === 'login' && (
          <motion.div 
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center min-h-screen p-6 relative"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-slate-800 to-slate-600" />
            
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 border border-slate-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-slate-900 rounded-xl">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">OurSpace</h1>
                  <p className="text-xs text-slate-500 font-medium">Zero-Knowledge Architecture</p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {/* 1. Identity */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">1. Your Name</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-slate-900 transition-all font-medium"
                    placeholder="e.g. Romeo"
                    required
                  />
                </div>
                
                {/* 2. Room Code (Address) */}
                <div>
                  <label className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <span>2. Room Code (Public Location)</span>
                    <button type="button" onClick={generateRandomRoom} className="text-blue-500 hover:text-blue-600 flex items-center gap-1 text-[10px] normal-case">
                      <RefreshCw className="w-3 h-3" /> Generate Random
                    </button>
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-slate-900 transition-all font-mono text-sm"
                      placeholder="e.g. room-8f92a1"
                      required
                    />
                    <Hash className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                  </div>
                </div>

                {/* 3. Secret Key (Lock) */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">3. Secret Key (Private Lock)</label>
                  <div className="relative">
                    <input 
                      type="password" 
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-slate-900 transition-all font-medium"
                      placeholder="Only you two know this"
                      required
                    />
                    <Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                    <span className="font-bold text-slate-600">Tip:</span> If you lose the Secret Key, data is lost forever. Room Code helps you find the chat; Secret Key decrypts it.
                  </p>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg py-3.5 mt-2 shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                >
                  Enter Secure Channel
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {view === 'chat' && (
          <motion.div 
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-[100dvh] max-w-lg mx-auto bg-white shadow-2xl relative"
          >
            <header className="flex items-center justify-between px-5 py-4 bg-white border-b border-slate-100 z-10 shadow-sm">
              <div>
                <h2 className="font-bold text-slate-900 text-lg leading-tight flex items-center gap-2">
                  OurSpace <span className="px-1.5 py-0.5 bg-slate-100 text-[10px] rounded text-slate-500 font-mono">V2</span>
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${activePartners.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                  <p className="text-xs font-medium text-slate-500">
                    {activePartners.length > 0 
                      ? `${activePartners.join(', ')} is here` 
                      : 'Waiting for partner...'}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-300 space-y-3">
                  <Shield className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">Room: {roomCode}</p>
                  <p className="text-xs text-slate-400">Waiting for encrypted messages...</p>
                </div>
              )}
              
              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === name ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{msg.sender}</span>
                    <span className="text-[10px] text-slate-300">{format(msg.createdAt, 'HH:mm')}</span>
                  </div>
                  <MessageBubble msg={msg} secretKey={secretKey} name={name} />
                </div>
              ))}
              <div ref={scrollRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-100">
              <form 
                onSubmit={handleSendMessage}
                className="flex items-end gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 focus-within:border-slate-400 transition-colors"
              >
                <label className="p-3 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleImageSelect}
                    disabled={isSending}
                  />
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                </label>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if(e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder="Type a secure message..."
                  className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 py-3 max-h-32 resize-none text-sm font-medium"
                  rows={1}
                />

                <button 
                  type="submit"
                  disabled={!inputText.trim()}
                  className="p-3 bg-slate-900 text-white rounded-lg shadow-md disabled:opacity-50 disabled:shadow-none hover:bg-slate-800 transition-all active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
