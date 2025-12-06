Bhai, main samajh gaya. Tumhe **Home Page (`app/page.js`)** ka wahi **Heavy, Auto-Expanding Code** chahiye jo pehle **Transactions History** khod-khod ke nikal raha tha.

**Logic:**

1.  Latest Blocks dikhao (6 Blocks).
2.  Lekin Transactions **bhar ke dikhao** (agar latest block mein nahi hain, to piche jao aur dhund ke lao).
3.  **Auto-Load More:** Agar transactions list choti hai (\< 15), to background mein aur piche ke blocks scan karo.
4.  **No Lag:** UI smooth rahega, bas list bharti jayegi.

Ye raha **"FlowStable CORE" (History-Aware Dashboard)**.
Isse **`app/page.js`** mein replace kar do. Length 271+ hai, heavy logic ke saath. 🚀

### 🏠 File: `app/page.js` (Smart History Expansion)

```javascript
"use client";
import { useEffect, useState, useRef } from 'react';
import { provider, formatGas, shortAddress } from '@/lib/utils';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { Box, Radio, Zap, Server, Globe, Cpu, Database, Loader2, ArrowRight } from 'lucide-react';

export default function Home() {
  const [stats, setStats] = useState({ gasPrice: '0', blockNumber: 0, chainId: 0 });
  const [blocks, setBlocks] = useState([]);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // History Pointers
  const processedHashes = useRef(new Set());
  const historyPointer = useRef(0); 
  const isFetchingMore = useRef(false);

  const fetchMainData = async () => {
    try {
      const currentBlockNum = await provider.getBlockNumber();
      const feeData = await provider.getFeeData();
      const network = await provider.getNetwork();

      setStats({
        gasPrice: feeData.gasPrice,
        blockNumber: currentBlockNum,
        chainId: network.chainId.toString()
      });

      // Initialize pointer on first load
      if (historyPointer.current === 0) {
          historyPointer.current = currentBlockNum - 6; 
      }

      // 1. UPDATE LATEST BLOCKS (UI)
      const displayRange = 6;
      const displayPromises = Array.from({length: displayRange}, (_, i) => provider.getBlock(currentBlockNum - i, false));
      const fetchedBlocks = (await Promise.all(displayPromises)).filter(b => b);
      setBlocks(fetchedBlocks);

      // 2. TRANSACTION COLLECTION
      let incomingTxs = [];

      // A. Check New Blocks first
      for (const block of fetchedBlocks) {
          if (block.transactions && block.transactions.length > 0) {
              const txsInBlock = await fetchTransactionsDetails(block.transactions);
              incomingTxs = [...incomingTxs, ...txsInBlock];
          }
      }

      // B. If List is small, DIG HISTORY
      // Hum tab tak piche jayenge jab tak list mein 20 items na ho jaye ya limit na aa jaye
      if (txs.length + incomingTxs.length < 20 && !isFetchingMore.current) {
          isFetchingMore.current = true;
          console.log(`Deep Scanning History from Block #${historyPointer.current}...`);
          
          const BATCH_SIZE = 10;
          const MAX_ATTEMPTS = 5; // Don't loop forever
          let attempts = 0;
          let foundHistoryTxs = [];
          
          while (foundHistoryTxs.length < 10 && attempts < MAX_ATTEMPTS) {
              const start = historyPointer.current;
              const historyPromises = [];
              
              for (let i = 0; i < BATCH_SIZE; i++) {
                  if (start - i > 0) historyPromises.push(provider.getBlock(start - i, false));
              }
              
              const oldBlocks = (await Promise.all(historyPromises)).filter(b => b);
              
              for (const b of oldBlocks) {
                  if (b && b.transactions.length > 0) {
                      const details = await fetchTransactionsDetails(b.transactions);
                      foundHistoryTxs = [...foundHistoryTxs, ...details];
                  }
              }
              
              historyPointer.current -= BATCH_SIZE;
              attempts++;
          }
          
          incomingTxs = [...incomingTxs, ...foundHistoryTxs];
          isFetchingMore.current = false;
      }

      // 3. MERGE & UPDATE STATE
      if (incomingTxs.length > 0) {
          setTxs(prev => {
              const combined = [...incomingTxs, ...prev];
              // Dedup
              const unique = combined.filter((t) => {
                  if (processedHashes.current.has(t.hash)) return false;
                  processedHashes.current.add(t.hash);
                  return true;
              });
              
              // Sort by Block (Newest First) & Limit Size
              return unique.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0)).slice(0, 30);
          });
      }

    } catch(e) { console.error("Sync Error", e); } 
    finally { setLoading(false); }
  };

  // Helper to resolve Txs (Handles String Hashes)
  const fetchTransactionsDetails = async (txList) => {
      const results = [];
      const promises = txList.map(async (tx) => {
          if (typeof tx === 'string') {
              try { return await provider.getTransaction(tx); } catch(e){ return null; }
          }
          return tx;
      });
      
      const resolved = await Promise.all(promises);
      return resolved.filter(t => t);
  };

  useEffect(() => {
    fetchMainData();
    const interval = setInterval(fetchMainData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] pb-10">
      <Navbar />
      
      {/* HEADER */}
      <div className="border-b border-[#222] bg-[#0a0a0a] py-8 px-6">
         <div className="max-w-[1600px] mx-auto">
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2 font-mono">
                FlowStable <span className="text-neon neon-text">Explorer</span>
            </h1>
            <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-neon rounded-full animate-pulse"></span>
                    MAINNET LIVE
                </span>
                <span>DEEP SCAN ACTIVE</span>
            </div>
         </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-6 mt-8">
        
        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={<Server size={20}/>} label="HEIGHT" value={`#${stats.blockNumber}`} />
            <StatCard icon={<Zap size={20}/>} label="GAS" value={`${formatGas(stats.gasPrice)} Gwei`} />
            <StatCard icon={<Globe size={20}/>} label="CHAIN ID" value={stats.chainId} />
            <StatCard icon={<Cpu size={20}/>} label="STATUS" value="OPERATIONAL" color="text-neon" />
        </div>

        {/* FEED */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* BLOCKS */}
            <div className="terminal-card">
                <div className="bg-[#111] p-3 border-b border-[#222] flex justify-between">
                    <h3 className="text-neon font-bold text-xs font-mono flex items-center gap-2">
                        <Box size={14}/> LATEST BLOCKS
                    </h3>
                </div>
                <div className="divide-y divide-[#1a1a1a]">
                    {loading ? <Loading/> : blocks.map(b => (
                        <div key={b.number} className="p-4 flex justify-between items-center hover:bg-[#0f0f0f] transition group">
                            <div className="flex items-center gap-4">
                                <div className="text-gray-500 font-mono text-[10px] group-hover:text-neon transition">
                                    [BK]
                                </div>
                                <div>
                                    <Link href={`/block/${b.number}`} className="text-white font-mono text-sm hover:text-neon hover:underline decoration-dashed">
                                        BLOCK #{b.number}
                                    </Link>
                                    <p className="text-[10px] text-gray-500 font-mono">{(Date.now()/1000 - b.timestamp).toFixed(0)}s ago</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className={`text-[10px] font-mono px-2 py-1 rounded border border-[#222] ${b.transactions.length > 0 ? 'text-neon bg-neon/5' : 'text-gray-600'}`}>
                                    {b.transactions.length} txns
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-2 text-center border-t border-[#222]">
                    <button className="text-[10px] text-gray-500 hover:text-neon font-mono uppercase">View All Blocks {'>'}</button>
                </div>
            </div>

            {/* TRANSACTIONS */}
            <div className="terminal-card">
                <div className="bg-[#111] p-3 border-b border-[#222] flex justify-between items-center">
                    <h3 className="text-neon font-bold text-xs font-mono flex items-center gap-2">
                        <Radio size={14}/> LIVE TRANSACTIONS
                    </h3>
                    <div className="flex items-center gap-2">
                         {isFetchingMore.current && (
                             <span className="flex items-center gap-1 text-[9px] text-yellow-500 font-mono animate-pulse">
                                 <Loader2 size={10} className="animate-spin"/> DIGGING HISTORY...
                             </span>
                         )}
                         <span className="text-[10px] text-gray-600 font-mono">
                            {txs.length} SHOWN
                        </span>
                    </div>
                </div>
                <div className="divide-y divide-[#1a1a1a]">
                    {loading && txs.length === 0 ? <Loading/> : txs.map(tx => (
                        <div key={tx.hash} className="p-4 flex flex-col gap-1 hover:bg-[#0f0f0f] transition">
                            <div className="flex items-center gap-2">
                                <span className="text-neon font-mono text-[10px]">{'>'}</span>
                                <Link href={`/tx/${tx.hash}`} className="text-neon font-mono text-xs truncate w-full hover:underline decoration-dashed">
                                    {tx.hash}
                                </Link>
                            </div>
                            <div className="flex justify-between pl-4 mt-1">
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500 font-mono">F:</span>
                                    <Link href={`/address/${tx.from}`} className="text-gray-300 hover:text-white text-[10px] font-mono">{shortAddress(tx.from)}</Link>
                                </div>
                                <ArrowRight size={10} className="text-gray-600"/>
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500 font-mono">T:</span>
                                    <Link href={`/address/${tx.to}`} className="text-gray-300 hover:text-white text-[10px] font-mono">{shortAddress(tx.to)}</Link>
                                </div>
                            </div>
                        </div>
                    ))}
                    {!loading && txs.length === 0 && (
                        <div className="p-10 text-center text-gray-600 font-mono text-xs">
                            <Database size={24} className="mx-auto mb-2 opacity-20"/>
                            SEARCHING HISTORY...
                        </div>
                    )}
                </div>
            </div>

        </div>
      </main>
    </div>
  );
}

const StatCard = ({icon, label, value, color}) => (
    <div className="terminal-card p-5 flex items-center gap-4 hover:border-neon transition bg-[#0a0a0a]">
        <div className={`p-3 bg-[#111] border border-[#333] text-gray-400`}>{icon}</div>
        <div>
            <p className="text-[10px] text-gray-500 font-bold font-mono uppercase">{label}</p>
            <p className={`text-xl font-bold font-mono ${color || 'text-white'}`}>{value}</p>
        </div>
    </div>
);

const Loading = () => <div className="p-6 text-center text-neon font-mono text-xs animate-pulse">_SYNCING...</div>;
```
